import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import {
  AttendanceMode,
  localDateTimeOf,
  punchCounts,
  scanImportFieldsSchema,
  workDateOf,
  zonedInstant,
  type ParsedScanRow,
  type PunchKind,
  type ScanFormat,
  type ScanImportCounts,
  type ScanImportPreview,
  type ScanImportPreviewRow,
  type ScanImportListQuery,
  type ScanImportSummary,
  type ScanTemplateFormat,
  type Paginated,
} from '@hrm/shared';
import type { Db, Tx } from '../../db/client';
import { parseIsoDate } from '../../lib/dates';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { sanitizeFileName } from '../files/file-type';
import type { UploadedFile } from '../files/files.service';
import { parameterReader } from '../parameters/parameters.service';
import { candidateDates, loadEmployeeDays, workingShiftOf, workspaceTimeZone } from './day-context';
import { createPunches } from './punches';
import { buildScanTemplate, readScanFile, SCAN_TEMPLATE_CONTENT_TYPES } from './scan-import.file';

/**
 * Scanner-file import (FR-ATT-02.1–02.6), on the employee import's pattern: preview analyses the file and saves
 * nothing; when at least one row can be imported it returns a signed token bound to the workspace, the user, the
 * SHA-256 of the bytes, the format/branch and the outcome of every row. Confirm needs the same file and token,
 * re-analyses inside one transaction and refuses (409) if anything changed since the preview; otherwise it stores
 * the import, its rows and the OK rows' punches (source SCANNER) through `createPunches`, which recomputes the days.
 */

const TOKEN_TTL_MS = 30 * 60 * 1000;
/** Confirm stores up to `employee.importMaxRows` punches and recomputes their days in one transaction. */
const IMPORT_TX_TIMEOUT_MS = 5 * 60 * 1000;
const ENDED_STATUSES = new Set(['RESIGNED', 'TERMINATED']);
const MS_PER_MINUTE = 60_000;

interface TokenPayload {
  ws: string;
  sub: string;
  sha: string;
  fmt: ScanFormat;
  br: string | null;
  /** Digest of every row's analysed outcome. */
  dig: string;
  exp: number;
}

/** One analysed row plus what confirm needs to store it. */
interface AnalysedRow extends ScanImportPreviewRow {
  capturedAt: Date | null;
  branchId: string | null;
  duplicateOfPunchId: string | null;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const minuteKey = (employeeId: string, at: Date) => `${employeeId}|${Math.floor(at.getTime() / MS_PER_MINUTE)}`;

/** Instant of a `YYYY-MM-DD HH:mm:ss` wall-clock time in `timeZone`. */
const localToInstant = (local: string, timeZone: string): Date => {
  const [date, time] = local.split(' ') as [string, string];
  const [h, m, s] = time.split(':').map(Number) as [number, number, number];
  return new Date(zonedInstant(date, h * 60 + m, timeZone).getTime() + s * 1000);
};

const emptyCounts = (): ScanImportCounts => ({ OK: 0, UNMATCHED: 0, DUPLICATE: 0, INVALID: 0 });

/**
 * Match, validate, de-duplicate and type every parsed row (read-only). Rules:
 * - UNMATCHED: no employee with that code, or the employee has left (RESIGNED/TERMINATED);
 * - INVALID: unparsable, a future time, another branch than the one chosen, or a branch without SCANNER mode;
 * - DUPLICATE: same employee and same minute as a stored punch or an earlier row of the file;
 * - rows without IN/OUT: the first punch of the employee's work date (stored or in the file) is IN, the rest OUT.
 */
export const analyseScanRows = async (
  tx: Tx,
  workspaceId: string,
  parsed: readonly ParsedScanRow[],
  opts: { branchId: string | null; now: Date },
): Promise<AnalysedRow[]> => {
  const timeZone = await workspaceTimeZone(tx, workspaceId);
  const codes = [...new Set(parsed.flatMap((r) => (r.employeeCode ? [r.employeeCode] : [])))];
  const employees = new Map(
    (
      await tx.employee.findMany({
        where: { workspaceId, employeeCode: { in: codes } },
        select: { id: true, employeeCode: true, firstName: true, lastName: true, status: true, branchId: true, branch: { select: { attendanceModes: true } } },
      })
    ).map((e) => [e.employeeCode, e]),
  );

  const rows: AnalysedRow[] = parsed.map((p) => ({
    rowNumber: p.rowNumber,
    employeeCode: p.employeeCode,
    employeeId: null,
    employeeName: null,
    localDateTime: p.localDateTime,
    workDate: null,
    kind: p.kind,
    kindInferred: false,
    status: 'OK',
    error: null,
    duplicateOfRow: null,
    capturedAt: null,
    branchId: null,
    duplicateOfPunchId: null,
  }));
  const fail = (r: AnalysedRow, status: AnalysedRow['status'], error: string) => Object.assign(r, { status, error });

  rows.forEach((r, i) => {
    const p = parsed[i]!;
    if (p.error || !p.employeeCode || !p.localDateTime) return void fail(r, 'INVALID', p.error ?? 'scan_invalid_line');
    const e = employees.get(p.employeeCode);
    if (!e) return void fail(r, 'UNMATCHED', 'scan_employee_not_found');
    Object.assign(r, { employeeId: e.id, employeeName: `${e.firstName} ${e.lastName}`, branchId: e.branchId });
    if (ENDED_STATUSES.has(e.status)) return void fail(r, 'UNMATCHED', 'scan_employee_inactive');
    if (opts.branchId && e.branchId !== opts.branchId) return void fail(r, 'INVALID', 'scan_employee_other_branch');
    if (!e.branch?.attendanceModes.includes(AttendanceMode.SCANNER)) return void fail(r, 'INVALID', 'scan_mode_disabled');
    r.capturedAt = localToInstant(p.localDateTime, timeZone);
    if (r.capturedAt.getTime() > opts.now.getTime()) return void fail(r, 'INVALID', 'scan_future_time');
  });

  // Work dates: one schedule load per employee for all the dates their scans may belong to.
  const candidates = rows.filter((r) => r.status === 'OK');
  const byEmployee = new Map<string, AnalysedRow[]>();
  for (const r of candidates) byEmployee.set(r.employeeId!, [...(byEmployee.get(r.employeeId!) ?? []), r]);
  for (const [employeeId, list] of byEmployee) {
    const dates = list.flatMap((r) => candidateDates(localDateTimeOf(r.capturedAt!, timeZone).date));
    const days = await loadEmployeeDays(tx, workspaceId, employeeId, dates);
    for (const r of list) r.workDate = workDateOf(r.capturedAt!, timeZone, (d) => workingShiftOf(days.get(d)));
  }

  // Stored punches around the file's time range, for duplicates and for the first-punch-of-the-day rule.
  const times = candidates.map((r) => r.capturedAt!.getTime());
  const workDates = [...new Set(candidates.map((r) => r.workDate!))];
  const stored = candidates.length
    ? (
        await tx.attendancePunch.findMany({
          where: {
            workspaceId,
            employeeId: { in: [...byEmployee.keys()] },
            OR: [
              { capturedAt: { gte: new Date(Math.min(...times) - MS_PER_MINUTE), lte: new Date(Math.max(...times) + MS_PER_MINUTE) } },
              { workDate: { in: workDates.map(parseIsoDate) } },
            ],
          },
          select: { id: true, employeeId: true, capturedAt: true, workDate: true, reviewStatus: true, supersededAt: true },
        })
      ).filter(punchCounts)
    : [];
  const storedByMinute = new Map(stored.map((p) => [minuteKey(p.employeeId, p.capturedAt), p.id]));
  const firstOfDay = new Map<string, number>();
  const dayKey = (employeeId: string, workDate: string) => `${employeeId}|${workDate}`;
  const noteFirst = (key: string, t: number) => firstOfDay.set(key, Math.min(t, firstOfDay.get(key) ?? Infinity));
  for (const p of stored) noteFirst(dayKey(p.employeeId, p.workDate.toISOString().slice(0, 10)), p.capturedAt.getTime());

  const fileByMinute = new Map<string, AnalysedRow>();
  for (const r of candidates) {
    const key = minuteKey(r.employeeId!, r.capturedAt!);
    const storedId = storedByMinute.get(key);
    const earlier = fileByMinute.get(key);
    if (storedId) Object.assign(fail(r, 'DUPLICATE', 'scan_duplicate_stored'), { duplicateOfPunchId: storedId });
    else if (earlier) Object.assign(fail(r, 'DUPLICATE', 'scan_duplicate_in_file'), { duplicateOfRow: earlier.rowNumber });
    else {
      fileByMinute.set(key, r);
      noteFirst(dayKey(r.employeeId!, r.workDate!), r.capturedAt!.getTime());
    }
  }

  const firstTaken = new Set<string>();
  for (const r of [...fileByMinute.values()].sort((a, b) => a.capturedAt!.getTime() - b.capturedAt!.getTime())) {
    if (r.kind) continue;
    const key = dayKey(r.employeeId!, r.workDate!);
    const isFirst = !firstTaken.has(key) && r.capturedAt!.getTime() === firstOfDay.get(key);
    firstTaken.add(key);
    Object.assign(r, { kind: (isFirst ? 'IN' : 'OUT') satisfies PunchKind, kindInferred: true });
  }
  return rows;
};

/** Stable digest of the analysis outcome; a changed outcome between preview and confirm invalidates the token. */
const outcomeDigest = (rows: readonly AnalysedRow[]) =>
  createHash('sha256')
    .update(JSON.stringify(rows.map((r) => [r.rowNumber, r.status, r.employeeId, r.workDate, r.kind, r.error])))
    .digest('base64url');

const toPreviewRow = ({ capturedAt: _c, branchId: _b, duplicateOfPunchId: _d, ...row }: AnalysedRow): ScanImportPreviewRow => row;

export const createScanImportService = (db: Db, opts: { secret: string }) => {
  const tokenKey = Buffer.from(hkdfSync('sha256', opts.secret, Buffer.alloc(0), 'hrm/scan-import/v1', 32));
  const sign = (data: string) => createHmac('sha256', tokenKey).update(data).digest();

  const issueToken = (payload: Omit<TokenPayload, 'exp'>, now: number) => {
    const body = b64(JSON.stringify({ ...payload, exp: now + TOKEN_TTL_MS } satisfies TokenPayload));
    return { token: `${body}.${b64(sign(body))}`, expiresAt: new Date(now + TOKEN_TTL_MS).toISOString() };
  };

  const readToken = (token: string | undefined): TokenPayload => {
    const [body, mac] = (token ?? '').split('.');
    const expected = body ? sign(body) : null;
    const given = mac ? Buffer.from(mac, 'base64url') : null;
    if (!body || !expected || !given || given.length !== expected.length || !timingSafeEqual(given, expected)) throw conflict('import_preview_mismatch');
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
  };

  /** Validate the multipart fields and the branch, parse the file. */
  const prepare = async (ctx: AuthContext, upload: UploadedFile, fields: Record<string, string>) => {
    const parsedFields = scanImportFieldsSchema.safeParse(fields);
    if (!parsedFields.success) throw badRequest('validation_error', { issues: parsedFields.error.issues });
    const { format, branchId = null, importToken } = parsedFields.data;
    const maxRows = await db.tenant(ctx.workspaceId, async (tx) => {
      if (branchId && !(await tx.branch.findFirst({ where: { id: branchId, workspaceId: ctx.workspaceId }, select: { id: true } }))) throw notFound('branch_not_found');
      return parameterReader.workspace(tx, ctx.workspaceId, 'employee.importMaxRows');
    });
    const parsed = await readScanFile(format, upload.data, maxRows);
    return { format, branchId, importToken, parsed, sha256: createHash('sha256').update(upload.data).digest('hex') };
  };

  const counts = (rows: readonly AnalysedRow[]) => rows.reduce((c, r) => ({ ...c, [r.status]: c[r.status] + 1 }), emptyCounts());

  return {
    template: async (format: ScanTemplateFormat) => ({
      fileName: `scan-import-template.${format}`,
      contentType: SCAN_TEMPLATE_CONTENT_TYPES[format],
      data: await buildScanTemplate(format),
    }),

    /** FR-ATT-02.4/02.5: match codes, flag unmatched / duplicate / invalid rows; nothing is saved. */
    async preview(ctx: AuthContext, upload: UploadedFile, fields: Record<string, string>): Promise<ScanImportPreview> {
      const { format, branchId, parsed, sha256 } = await prepare(ctx, upload, fields);
      const now = new Date();
      const rows = await db.tenant(ctx.workspaceId, (tx) => analyseScanRows(tx, ctx.workspaceId, parsed, { branchId, now }), { timeoutMs: IMPORT_TX_TIMEOUT_MS });
      const c = counts(rows);
      const token = c.OK > 0 ? issueToken({ ws: ctx.workspaceId, sub: ctx.userId, sha: sha256, fmt: format, br: branchId, dig: outcomeDigest(rows) }, now.getTime()) : null;
      return { format, branchId, totalRows: rows.length, counts: c, rows: rows.map(toPreviewRow), importToken: token?.token ?? null, expiresAt: token?.expiresAt ?? null };
    },

    /** FR-ATT-02.6: store the previewed file's OK rows as SCANNER punches, all in one transaction. */
    async confirm(ctx: AuthContext, upload: UploadedFile, fields: Record<string, string>): Promise<ScanImportSummary> {
      const { format, branchId, parsed, sha256, importToken } = await prepare(ctx, upload, fields);
      const t = readToken(importToken);
      if (t.ws !== ctx.workspaceId || t.sub !== ctx.userId || t.sha !== sha256 || t.fmt !== format || t.br !== branchId) throw conflict('import_preview_mismatch');
      if (t.exp < Date.now()) throw conflict('import_preview_expired');
      const fileName = sanitizeFileName(upload.fileName, 'txt');
      const now = new Date();

      const id = await db.tenant(
        ctx.workspaceId,
        async (tx) => {
          const ws = ctx.workspaceId;
          const rows = await analyseScanRows(tx, ws, parsed, { branchId, now });
          // Someone imported or corrected punches since the preview: the reviewed table is no longer what happens.
          if (outcomeDigest(rows) !== t.dig) throw conflict('scan_import_changed');
          const c = counts(rows);
          const ok = rows.filter((r) => r.status === 'OK');
          const imp = await tx.scanImport.create({
            data: {
              workspaceId: ws, fileName, format, sha256, branchId, status: 'COMPLETED', uploadedById: ctx.userId,
              totalRows: rows.length, importedRows: ok.length, errorRows: rows.length - ok.length,
            },
          });
          const { created } = await createPunches(
            tx,
            ws,
            ok.map((r) => ({
              employeeId: r.employeeId!, kind: r.kind!, capturedAt: r.capturedAt!, workDate: r.workDate!, branchId: r.branchId,
              source: 'SCANNER' as const, scanImportId: imp.id,
            })),
            now,
          );
          const punchOfRow = new Map(ok.map((r, i) => [r.rowNumber, created[i]!.id]));
          await tx.scanImportRow.createMany({
            data: rows.map((r) => ({
              workspaceId: ws, importId: imp.id, rowNumber: r.rowNumber, employeeCode: r.employeeCode, capturedAt: r.capturedAt,
              matchedEmployeeId: r.employeeId, status: r.status, error: r.error, punchId: punchOfRow.get(r.rowNumber) ?? null,
              duplicateOfPunchId: r.duplicateOfPunchId ?? (r.duplicateOfRow !== null ? (punchOfRow.get(r.duplicateOfRow) ?? null) : null),
            })),
          });
          await auditRepository.create(tx, {
            workspaceId: ws, actorUserId: ctx.userId, action: 'attendance.scan_imported', entity: 'ScanImport', entityId: imp.id,
            meta: { format, branchId, fileName, fileSha256: sha256, ...c },
          });
          return imp.id;
        },
        { timeoutMs: IMPORT_TX_TIMEOUT_MS },
      );
      return (await this.get(ctx, id))!;
    },

    async get(ctx: AuthContext, id: string): Promise<ScanImportSummary | null> {
      const list = await this.list(ctx, { page: 1, pageSize: 1 }, id);
      return list.items[0] ?? null;
    },

    /** Import history of the workspace, newest first. */
    async list(ctx: AuthContext, q: ScanImportListQuery, id?: string): Promise<Paginated<ScanImportSummary>> {
      const ws = ctx.workspaceId;
      return db.tenant(ws, async (tx) => {
        const where = { workspaceId: ws, ...(id ? { id } : {}) };
        const [items, total] = await Promise.all([
          tx.scanImport.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
          tx.scanImport.count({ where }),
        ]);
        const [branches, users] = await Promise.all([
          tx.branch.findMany({ where: { workspaceId: ws, id: { in: items.flatMap((i) => (i.branchId ? [i.branchId] : [])) } }, select: { id: true, name: true } }),
          tx.user.findMany({ where: { workspaceId: ws, id: { in: items.flatMap((i) => (i.uploadedById ? [i.uploadedById] : [])) } }, select: { id: true, displayName: true } }),
        ]);
        const branchName = new Map(branches.map((b) => [b.id, b.name]));
        const userName = new Map(users.map((u) => [u.id, u.displayName]));
        return {
          items: items.map((i) => ({
            id: i.id, fileName: i.fileName, format: i.format, branchId: i.branchId, branchName: i.branchId ? (branchName.get(i.branchId) ?? null) : null,
            status: i.status, totalRows: i.totalRows, importedRows: i.importedRows, errorRows: i.errorRows,
            uploadedByName: i.uploadedById ? (userName.get(i.uploadedById) ?? null) : null, createdAt: i.createdAt.toISOString(),
          })),
          total,
          page: q.page,
          pageSize: q.pageSize,
        };
      });
    },
  };
};

export type ScanImportService = ReturnType<typeof createScanImportService>;
