import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import {
  createEmployeeSchema,
  EMPLOYEE_IMPORT_COLUMNS,
  EMPLOYEE_IMPORT_SAMPLE_COLUMNS,
  translate,
  type EmployeeImportColumn,
  type EmployeeImportColumnKey,
  type EmployeeImportError,
  type EmployeeImportFormat,
  type EmployeeImportPreview,
  type EmployeeImportResult,
  type EmployeeImportSampleRow,
} from '@hrm/shared';
import type { ZodIssue } from 'zod';
import type { Db, Tx } from '../../db/client';
import { normalizeIdentifier } from '../../lib/crypto';
import { AppError, badRequest, conflict } from '../../lib/errors';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { sanitizeFileName } from '../files/file-type';
import type { UploadedFile } from '../files/files.service';
import { parameterReader } from '../parameters/parameters.service';
import { buildTemplate, readImportFile, TEMPLATE_CONTENT_TYPES, type RawCell, type RawSheet } from './employee-import.file';
import type { EmployeesService } from './employees.service';

/**
 * Bulk employee import (FR-EMP-09).
 *
 * Every row is validated with `createEmployeeSchema` and written with `employees.createInTx` — the
 * exact path of POST /employees — so the import never has rules of its own beyond mapping the file.
 *
 * Preview → confirm is stateless: the preview runs the full create path in a transaction that is
 * always rolled back and, when there are no errors, returns a signed token bound to the workspace,
 * the user and the SHA-256 of the file bytes. Confirm requires the same file plus the token, then
 * re-validates and commits all rows in one transaction. Nothing (in particular no ID card or social
 * security numbers) is kept at rest between the two calls, so no staging table or cleanup job is needed.
 */

/** How long a preview may be confirmed; long enough to review the table, short enough to stay fresh. */
const TOKEN_TTL_MS = 30 * 60 * 1000;
/**
 * The all-or-nothing transaction runs the single-create path per row (~25 queries each); at the
 * `employee.importMaxRows` maximum that takes far longer than the default 10 s interactive timeout.
 */
const IMPORT_TX_TIMEOUT_MS = 5 * 60 * 1000;
/** Rows echoed back in the preview besides the error rows. */
const SAMPLE_ROWS = 20;

const COLUMNS = EMPLOYEE_IMPORT_COLUMNS as readonly EmployeeImportColumn[];
type ColumnKey = EmployeeImportColumnKey;
const columnOf = (key: ColumnKey) => COLUMNS.find((c) => c.key === key)!;
type RowError = Omit<EmployeeImportError, 'row'>;

/** Create-schema fields that the file supplies through a reference column. */
const REF_FIELD_COLUMN: Record<string, ColumnKey> = {
  branchId: 'branch',
  departmentId: 'department',
  positionId: 'position',
  managerId: 'managerCode',
};
const REF_COLUMNS = new Set(Object.values(REF_FIELD_COLUMN));
/** Service conflict codes → the column holding the duplicate value. */
const CONFLICT_COLUMN: Record<string, ColumnKey> = {
  employee_code_taken: 'employeeCode',
  duplicate_national_id: 'idCardNo',
  duplicate_social_security_no: 'socialSecurityNo',
};
/** Unique keys also checked for repeats inside the file (FR-EMP-10.1–10.3). */
const UNIQUE_COLUMNS: { key: ColumnKey; normalize: (v: string) => string }[] = [
  { key: 'employeeCode', normalize: (v) => v },
  { key: 'idCardNo', normalize: normalizeIdentifier },
  { key: 'socialSecurityNo', normalize: normalizeIdentifier },
];

// ─────────────────────────── Header + cell mapping ───────────────────────────

const normHeader = (v: string) => v.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const HEADER_ALIASES = new Map<string, ColumnKey>(
  COLUMNS.flatMap((c) => {
    const lo = translate('lo', c.labelKey);
    const en = translate('en', c.labelKey);
    return [c.key, lo, en, `${lo} / ${en}`].map((h) => [normHeader(h), c.key as ColumnKey] as const);
  }),
);

/** Column index → key, plus header errors (row 1): unknown, repeated or missing required columns. */
const mapHeader = (header: RawCell[]) => {
  const errors: EmployeeImportError[] = [];
  const index = new Map<number, ColumnKey>();
  const seen = new Set<ColumnKey>();
  header.forEach((cell, i) => {
    const text = typeof cell === 'string' ? cell.trim() : cell === null ? '' : String(cell);
    if (!text) return;
    const key = HEADER_ALIASES.get(normHeader(text));
    if (!key) errors.push({ row: 1, column: text, code: 'unknown_column' });
    else if (seen.has(key)) errors.push({ row: 1, column: key, code: 'duplicate_column' });
    else {
      seen.add(key);
      index.set(i, key);
    }
  });
  for (const c of COLUMNS) if (c.required && !seen.has(c.key as ColumnKey)) errors.push({ row: 1, column: c.key, code: 'missing_column' });
  return { index, errors };
};

/**
 * Text that a spreadsheet would run as a formula when the data is exported again (CSV injection).
 * A leading +/- followed by a digit stays allowed for phone numbers such as +856 20…
 */
const FORMULA_LIKE = /^(?:[=@\t\r]|[+-](?!\d))/;
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MAX_EXCEL_SERIAL = 2958465; // 9999-12-31
const BOOLEAN_TEXT: Record<string, boolean> = { yes: true, no: false, true: true, false: false, '1': true, '0': false, y: true, n: false, ແມ່ນ: true, ບໍ່: false };

type CellResult = { value: string | boolean | undefined } | { error: string };

/** Normalise one cell for its column: dates to YYYY-MM-DD, codes upper-cased, booleans parsed. */
const readCell = (column: EmployeeImportColumn, cell: RawCell): CellResult => {
  if (cell === null) return { value: undefined };
  if (typeof cell === 'object' && 'formula' in cell) return { error: 'formula_not_allowed' };
  if (typeof cell === 'object' && 'error' in cell) return { error: 'invalid_value' };
  if (cell instanceof Date) return { value: cell.toISOString().slice(0, 10) };
  if (typeof cell === 'number') {
    if (column.kind !== 'date') return { value: String(cell) };
    if (cell < 1 || cell > MAX_EXCEL_SERIAL) return { error: 'invalid_date' };
    return { value: new Date(EXCEL_EPOCH_MS + Math.floor(cell) * 86_400_000).toISOString().slice(0, 10) };
  }
  if (typeof cell === 'boolean') return column.kind === 'boolean' ? { value: cell } : { value: String(cell).toUpperCase() };
  const text = cell.trim();
  if (!text) return { value: undefined };
  if (FORMULA_LIKE.test(text)) return { error: 'formula_not_allowed' };
  if (column.kind === 'code') return { value: text.toUpperCase() };
  if (column.kind === 'boolean') {
    const b = BOOLEAN_TEXT[text.toLowerCase()];
    return b === undefined ? { error: 'invalid_value' } : { value: b };
  }
  return { value: text };
};

/** Stable translatable code for a create-schema issue (custom messages already are codes). */
const issueCode = (issue: ZodIssue): string => {
  if (/^[a-z][a-z0-9_]*$/.test(issue.message)) return issue.message;
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' ? 'required' : 'invalid_value';
    case 'invalid_enum_value':
      return 'invalid_option';
    case 'too_big':
      return 'too_long';
    case 'too_small':
      return 'required';
    default:
      return 'invalid_value';
  }
};
const fieldColumn = (field: unknown): string | null => (typeof field === 'string' ? (REF_FIELD_COLUMN[field] ?? field) : null);

/** Row errors for a rejected create (AppError from the employees service). */
const serviceErrors = (err: AppError): RowError[] => {
  const fields = (err.details as { fields?: unknown } | undefined)?.fields;
  if (Array.isArray(fields) && fields.length) return fields.map((f) => ({ column: fieldColumn(f), code: err.code }));
  return [{ column: CONFLICT_COLUMN[err.code] ?? null, code: err.code }];
};

// ─────────────────────────── Token ───────────────────────────

interface TokenPayload {
  ws: string;
  sub: string;
  sha: string;
  exp: number;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

// ─────────────────────────── Service ───────────────────────────

interface ParsedImport {
  sheet: RawSheet;
  sha256: string;
}

export const createEmployeeImportService = (db: Db, employees: Pick<EmployeesService, 'createInTx'>, opts: { secret: string }) => {
  // Separate key (HKDF) so an import token can never be confused with an access token or a blind index.
  const tokenKey = Buffer.from(hkdfSync('sha256', opts.secret, Buffer.alloc(0), 'hrm/employee-import/v1', 32));
  const sign = (data: string) => createHmac('sha256', tokenKey).update(data).digest();

  const issueToken = (ctx: AuthContext, sha: string, now: number) => {
    const payload: TokenPayload = { ws: ctx.workspaceId, sub: ctx.userId, sha, exp: now + TOKEN_TTL_MS };
    const body = b64(JSON.stringify(payload));
    return { token: `${body}.${b64(sign(body))}`, expiresAt: new Date(payload.exp).toISOString() };
  };

  /** Confirm must carry the token of a preview of these exact bytes, by this user, in this workspace. */
  const verifyToken = (ctx: AuthContext, token: string | undefined, sha: string) => {
    const [body, mac] = (token ?? '').split('.');
    const expected = body ? sign(body) : null;
    const given = mac ? Buffer.from(mac, 'base64url') : null;
    if (!body || !expected || !given || given.length !== expected.length || !timingSafeEqual(given, expected)) throw conflict('import_preview_mismatch');
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (p.ws !== ctx.workspaceId || p.sub !== ctx.userId || p.sha !== sha) throw conflict('import_preview_mismatch');
    if (p.exp < Date.now()) throw conflict('import_preview_expired');
  };

  const parse = async (ctx: AuthContext, upload: UploadedFile): Promise<ParsedImport> => {
    if (upload.data.length === 0) throw badRequest('file_required');
    const maxRows = await db.tenant(ctx.workspaceId, (tx) => parameterReader.workspace(tx, ctx.workspaceId, 'employee.importMaxRows'));
    return { sheet: await readImportFile(upload.data, maxRows), sha256: createHash('sha256').update(upload.data).digest('hex') };
  };

  /**
   * Validate and create every row inside `tx` (each row behind a savepoint so one failure does not
   * hide the others). Returns all errors; the caller decides whether to commit or roll back.
   */
  const runRows = async (tx: Tx, ctx: AuthContext, sheet: RawSheet): Promise<EmployeeImportError[]> => {
    const ws = ctx.workspaceId;
    const { index, errors } = mapHeader(sheet.header);
    if (errors.length) return errors;

    const units = await Promise.all([
      tx.branch.findMany({ where: { workspaceId: ws }, select: { id: true, name: true } }),
      tx.department.findMany({ where: { workspaceId: ws }, select: { id: true, name: true } }),
      tx.position.findMany({ where: { workspaceId: ws }, select: { id: true, name: true } }),
    ]);
    // Org units by id or (case-insensitive) name. Closed units resolve too: the create path rejects them (`org_unit_closed`).
    const lookups = (['branch', 'department', 'position'] as const).map((key, i) => {
      const map = new Map<string, string>();
      for (const u of units[i]!) {
        map.set(u.id, u.id);
        map.set(u.name.trim().toLowerCase(), u.id);
      }
      return [key, map] as const;
    });
    const seen = new Set<string>();

    for (const { row, cells } of sheet.rows) {
      const rowErrors: RowError[] = [];
      const values: Partial<Record<ColumnKey, string | boolean>> = {};
      index.forEach((key, i) => {
        const result = readCell(columnOf(key), cells[i] ?? null);
        if ('error' in result) rowErrors.push({ column: key, code: result.error });
        else if (result.value !== undefined) values[key] = result.value;
      });

      for (const { key, normalize } of UNIQUE_COLUMNS) {
        const v = values[key];
        if (typeof v !== 'string') continue;
        const id = `${key}:${normalize(v)}`;
        if (seen.has(id)) rowErrors.push({ column: key, code: 'duplicate_in_file' });
        else seen.add(id);
      }

      const input: Record<string, unknown> = Object.fromEntries(Object.entries(values).filter(([k]) => !REF_COLUMNS.has(k as ColumnKey)));
      for (const [key, map] of lookups) {
        const v = values[key];
        if (typeof v !== 'string') continue;
        const id = map.get(v) ?? map.get(v.toLowerCase());
        if (id) input[`${key}Id`] = id;
        else rowErrors.push({ column: key, code: 'unknown_reference' });
      }
      const managerCode = values.managerCode;
      if (typeof managerCode === 'string') {
        // Existing employees and rows created earlier in this transaction.
        const manager = await tx.employee.findFirst({ where: { workspaceId: ws, employeeCode: managerCode }, select: { id: true } });
        if (manager) input.managerId = manager.id;
        else rowErrors.push({ column: 'managerCode', code: 'unknown_reference' });
      }

      const parsed = createEmployeeSchema.safeParse(input);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const column = fieldColumn(issue.path[0]);
          // A cell already reported (e.g. formula) is not reported twice.
          if (!rowErrors.some((e) => e.column === column)) rowErrors.push({ column, code: issueCode(issue) });
        }
      }
      if (rowErrors.length || !parsed.success) {
        errors.push(...rowErrors.map((e) => ({ row, ...e })));
        continue;
      }

      await tx.$executeRaw`SAVEPOINT employee_import_row`;
      try {
        await employees.createInTx(tx, ctx, parsed.data);
        await tx.$executeRaw`RELEASE SAVEPOINT employee_import_row`;
      } catch (err) {
        if (!(err instanceof AppError) || err.statusCode >= 500) throw err;
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT employee_import_row`;
        errors.push(...serviceErrors(err).map((e) => ({ row, ...e })));
      }
    }
    return errors;
  };

  /** Non-sensitive display values of the first rows and of every row with an error. */
  const sample = (sheet: RawSheet, errors: EmployeeImportError[]): EmployeeImportSampleRow[] => {
    const { index } = mapHeader(sheet.header);
    const errorRows = new Set(errors.map((e) => e.row));
    return sheet.rows
      .filter((r, i) => i < SAMPLE_ROWS || errorRows.has(r.row))
      .map(({ row, cells }) => {
        const values: EmployeeImportSampleRow['values'] = {};
        index.forEach((key, i) => {
          const col = EMPLOYEE_IMPORT_SAMPLE_COLUMNS.find((k) => k === key);
          if (!col) return;
          const result = readCell(columnOf(key), cells[i] ?? null);
          if ('value' in result && result.value !== undefined) values[col] = String(result.value);
        });
        return { row, values };
      });
  };

  /** Thrown to roll the preview transaction back after collecting its result. */
  class PreviewRollback extends Error {
    constructor(public readonly errors: EmployeeImportError[]) {
      super('preview rollback');
    }
  }

  return {
    template: async (format: EmployeeImportFormat) => ({
      fileName: `employee-import-template.${format}`,
      contentType: TEMPLATE_CONTENT_TYPES[format],
      data: await buildTemplate(format),
    }),

    /** Validate the whole file through the create path without saving anything (FR-EMP-09.2). */
    async preview(ctx: AuthContext, upload: UploadedFile): Promise<EmployeeImportPreview> {
      const { sheet, sha256 } = await parse(ctx, upload);
      const errors = await db
        .tenant(
          ctx.workspaceId,
          async (tx) => {
            throw new PreviewRollback(await runRows(tx, ctx, sheet));
          },
          { timeoutMs: IMPORT_TX_TIMEOUT_MS },
        )
        .catch((err: unknown) => {
          if (err instanceof PreviewRollback) return err.errors;
          throw err;
        });
      const token = errors.length ? null : issueToken(ctx, sha256, Date.now());
      return { rows: sheet.rows.length, errors, sample: sample(sheet, errors), importToken: token?.token ?? null, expiresAt: token?.expiresAt ?? null };
    },

    /** Create every row of the previewed file in one transaction, or none (FR-EMP-09.1/09.2). */
    async confirm(ctx: AuthContext, upload: UploadedFile, token: string | undefined): Promise<EmployeeImportResult> {
      const { sheet, sha256 } = await parse(ctx, upload);
      verifyToken(ctx, token, sha256);
      return db.tenant(
        ctx.workspaceId,
        async (tx) => {
          // Data may have changed since the preview: every row is checked again.
          const errors = await runRows(tx, ctx, sheet);
          if (errors.length) throw badRequest('import_invalid', { errors });
          await auditRepository.create(tx, {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            action: 'employee.imported',
            entity: 'Employee',
            meta: { rows: sheet.rows.length, fileSha256: sha256, fileName: sanitizeFileName(upload.fileName, 'xlsx') },
          });
          return { created: sheet.rows.length };
        },
        { timeoutMs: IMPORT_TX_TIMEOUT_MS },
      );
    },
  };
};

export type EmployeeImportService = ReturnType<typeof createEmployeeImportService>;
