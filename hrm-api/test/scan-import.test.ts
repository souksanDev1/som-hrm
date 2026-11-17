import { randomBytes } from 'node:crypto';
import type { Paginated, ScanImportPreview, ScanImportSummary } from '@hrm/shared';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseIsoDate } from '../src/lib/dates';
import {
  api, bearer, createTestContext, createUser, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD,
  type TestContext, type WorkspaceFixture,
} from './helpers';

/** Scanner-file import (FR-ATT-02.1–02.6) on PostgreSQL: preview → token → confirm, statuses, tamper, scope. */
let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const multipart = (fileName: string, content: Buffer, fields: Record<string, string>) => {
  const boundary = `----hrm${randomBytes(8).toString('hex')}`;
  const parts = Object.entries(fields).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  const payload = Buffer.concat([
    ...parts,
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
};
const send = (path: string, token: string, content: Buffer, fields: Record<string, string>, fileName = 'scans.csv') => {
  const { payload, headers } = multipart(fileName, content, fields);
  return t.app.inject({ method: 'POST', url: api(`/attendance/scan-imports/${path}`), headers: { ...bearer(token), ...headers }, payload });
};
const preview = (token: string, content: Buffer, fields: Record<string, string> = { format: 'GENERIC' }, fileName?: string) =>
  send('preview', token, content, fields, fileName);
const previewOk = async (token: string, content: Buffer, fields?: Record<string, string>, fileName?: string) => {
  const res = await preview(token, content, fields, fileName);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<ScanImportPreview>();
};
const confirm = (token: string, content: Buffer, importToken: string, fields: Record<string, string> = { format: 'GENERIC' }) =>
  send('confirm', token, content, { ...fields, importToken });

const generic = (lines: string[]) => Buffer.from(['employee_code,date,time,type', ...lines].join('\n'));

interface Setup {
  ws: WorkspaceFixture;
  token: string;
  branchId: string;
  mobileBranchId: string;
  employees: Record<string, string>;
}

/** A workspace with a SCANNER branch (codes `<p>1`, `<p>2`, resigned `<p>X`) and a MOBILE-only branch (`<p>M`). */
const setup = async (prefix = 'S'): Promise<Setup> => {
  const ws = await createWorkspace(t.db);
  const token = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
  const [scanner, mobile] = await t.db.tenant(ws.workspaceId, (tx) =>
    Promise.all([
      tx.branch.create({ data: { workspaceId: ws.workspaceId, name: 'Factory', attendanceModes: ['SCANNER', 'MOBILE'] } }),
      tx.branch.create({ data: { workspaceId: ws.workspaceId, name: 'Office', attendanceModes: ['MOBILE'] } }),
    ]),
  );
  const employees: Record<string, string> = {};
  for (const [code, branchId, status] of [
    [`${prefix}1`, scanner.id, 'ACTIVE'],
    [`${prefix}2`, scanner.id, 'ACTIVE'],
    [`${prefix}X`, scanner.id, 'RESIGNED'],
    [`${prefix}M`, mobile.id, 'ACTIVE'],
  ] as const) {
    const res = await t.app.inject({ method: 'POST', url: api('/employees'), headers: bearer(token), payload: employeePayload({ employeeCode: code, branchId }) });
    expect(res.statusCode, res.body).toBe(201);
    const id = res.json<{ employee: { id: string } }>().employee.id;
    if (status !== 'ACTIVE') await t.db.tenant(ws.workspaceId, (tx) => tx.employee.update({ where: { id }, data: { status } }));
    employees[code] = id;
  }
  return { ws, token, branchId: scanner.id, mobileBranchId: mobile.id, employees };
};

const punches = (s: Setup) =>
  t.db.tenant(s.ws.workspaceId, (tx) => tx.attendancePunch.findMany({ where: { workspaceId: s.ws.workspaceId }, orderBy: { capturedAt: 'asc' } }));
const statuses = (p: ScanImportPreview) => p.rows.map((r) => `${r.rowNumber}:${r.status}${r.error ? `:${r.error}` : ''}`);

describe('scanner import preview + confirm (FR-ATT-02.4–02.6)', () => {
  it('previews without saving, confirms OK rows as SCANNER punches and recomputes the day', async () => {
    const s = await setup();
    const file = generic(['S1,2026-11-16,07:58', 'S1,16/11/2026,17:05:10', 'S2,2026-11-16,08:20,IN']);
    const p = await previewOk(s.token, file);
    expect(p.counts).toEqual({ OK: 3, UNMATCHED: 0, DUPLICATE: 0, INVALID: 0 });
    expect(p.rows.map((r) => [r.employeeCode, r.kind, r.kindInferred, r.workDate])).toEqual([
      ['S1', 'IN', true, '2026-11-16'],
      ['S1', 'OUT', true, '2026-11-16'],
      ['S2', 'IN', false, '2026-11-16'],
    ]);
    expect(p.rows[0]!.employeeName).toBe('ສົມໃຈ ດວງດີ');
    expect(p.importToken).toBeTruthy();
    expect(await punches(s)).toHaveLength(0);

    const res = await confirm(s.token, file, p.importToken!);
    expect(res.statusCode, res.body).toBe(201);
    const imp = res.json<ScanImportSummary>();
    expect(imp).toMatchObject({ format: 'GENERIC', totalRows: 3, importedRows: 3, errorRows: 0, status: 'COMPLETED', fileName: 'scans.csv' });

    const stored = await punches(s);
    expect(stored.map((x) => [x.employeeId, x.kind, x.source, x.scanImportId, x.branchId])).toEqual([
      [s.employees.S1, 'IN', 'SCANNER', imp.id, s.branchId],
      [s.employees.S2, 'IN', 'SCANNER', imp.id, s.branchId],
      [s.employees.S1, 'OUT', 'SCANNER', imp.id, s.branchId],
    ]);
    // 07:58 is stored in the workspace zone (Asia/Vientiane, UTC+7).
    expect(stored[0]!.capturedAt.toISOString()).toBe('2026-11-16T00:58:00.000Z');
    const day = await t.db.tenant(s.ws.workspaceId, (tx) =>
      tx.attendanceDay.findUnique({ where: { employeeId_workDate: { employeeId: s.employees.S1!, workDate: parseIsoDate('2026-11-16') } } }),
    );
    expect(day).toMatchObject({ firstInPunchId: stored[0]!.id, lastOutPunchId: stored[2]!.id });
    expect(day!.workedMinutes).toBeGreaterThan(0);

    const rows = await t.db.tenant(s.ws.workspaceId, (tx) => tx.scanImportRow.findMany({ where: { importId: imp.id }, orderBy: { rowNumber: 'asc' } }));
    expect(rows.map((r) => [r.rowNumber, r.status, r.matchedEmployeeId, r.punchId !== null])).toEqual([
      [2, 'OK', s.employees.S1, true],
      [3, 'OK', s.employees.S1, true],
      [4, 'OK', s.employees.S2, true],
    ]);
    const audit = await t.db.tenant(s.ws.workspaceId, (tx) => tx.auditLog.findFirst({ where: { workspaceId: s.ws.workspaceId, action: 'attendance.scan_imported' } }));
    expect(audit?.entityId).toBe(imp.id);

    const history = await t.app.inject({ method: 'GET', url: api('/attendance/scan-imports'), headers: bearer(s.token) });
    expect(history.json<Paginated<ScanImportSummary>>().items.map((i) => i.id)).toEqual([imp.id]);
  });

  it('flags unmatched, inactive, other-branch, scanner-disabled, unparsable and future rows', async () => {
    const s = await setup();
    const file = generic([
      'S1,2026-11-16,08:00',
      'NOPE,2026-11-16,08:00',
      'SX,2026-11-16,08:00',
      'SM,2026-11-16,08:00',
      'S2,2026-02-30,08:00',
      'S2,2099-01-01,08:00',
      'S2,2026-11-16,08:00,BREAK',
    ]);
    expect(statuses(await previewOk(s.token, file))).toEqual([
      '2:OK',
      '3:UNMATCHED:scan_employee_not_found',
      '4:UNMATCHED:scan_employee_inactive',
      '5:INVALID:scan_mode_disabled',
      '6:INVALID:scan_invalid_date',
      '7:INVALID:scan_future_time',
      '8:INVALID:scan_invalid_type',
    ]);
    // Choosing the scanner branch also excludes employees of other branches.
    await t.db.tenant(s.ws.workspaceId, (tx) => tx.branch.update({ where: { id: s.mobileBranchId }, data: { attendanceModes: ['SCANNER'] } }));
    const p = await previewOk(s.token, file, { format: 'GENERIC', branchId: s.branchId });
    expect(p.rows[3]).toMatchObject({ status: 'INVALID', error: 'scan_employee_other_branch' });
    expect(p.branchId).toBe(s.branchId);

    // Confirm stores the OK row only and records the rest as skipped rows.
    const res = await confirm(s.token, file, p.importToken!, { format: 'GENERIC', branchId: s.branchId });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json<ScanImportSummary>()).toMatchObject({ totalRows: 7, importedRows: 1, errorRows: 6, branchName: 'Factory' });
    expect(await punches(s)).toHaveLength(1);
  });

  it('marks repeats of the same minute in the file and of stored punches as DUPLICATE (FR-ATT-02.5)', async () => {
    const s = await setup();
    const file = generic(['S1,2026-11-16,08:00:05', 'S1,2026-11-16,08:00:40', 'S1,2026-11-16,08:01', 'S1,2026-11-16,17:00']);
    const p = await previewOk(s.token, file);
    expect(statuses(p)).toEqual(['2:OK', '3:DUPLICATE:scan_duplicate_in_file', '4:OK', '5:OK']);
    expect(p.rows[1]!.duplicateOfRow).toBe(2);
    expect(p.rows.map((r) => r.kind)).toEqual(['IN', null, 'OUT', 'OUT']);
    const res = await confirm(s.token, file, p.importToken!);
    expect(res.statusCode, res.body).toBe(201);
    const rows = await t.db.tenant(s.ws.workspaceId, (tx) => tx.scanImportRow.findMany({ where: { workspaceId: s.ws.workspaceId }, orderBy: { rowNumber: 'asc' } }));
    expect(rows[1]!.duplicateOfPunchId).toBe(rows[0]!.punchId);

    // The same file again: every row is now already stored, so there is nothing to import.
    const again = await previewOk(s.token, file);
    expect(again.counts).toEqual({ OK: 0, UNMATCHED: 0, DUPLICATE: 4, INVALID: 0 });
    expect(again.rows[0]!.error).toBe('scan_duplicate_stored');
    expect(again.importToken).toBeNull();

    // A later scan the same day without IN/OUT is OUT because a stored IN already opened the day.
    const later = await previewOk(s.token, generic(['S1,2026-11-16,18:30']));
    expect(later.rows[0]).toMatchObject({ status: 'OK', kind: 'OUT', kindInferred: true });
  });

  it('parses ZKTeco attlog.dat and an Excel generic file through the API', async () => {
    const s = await setup('7');
    const attlog = Buffer.from('     71\t2026-11-16 08:01:22\t1\t0\t1\t0\r\n71\t2026-11-16 17:02:00\t1\t1\t1\t0\r\n99\t2026-11-16 08:00:00\t1\t0\t1\t0\r\n');
    const p = await previewOk(s.token, attlog, { format: 'ZKTECO' }, 'attlog.dat');
    expect(statuses(p)).toEqual(['1:OK', '2:OK', '3:UNMATCHED:scan_employee_not_found']);
    expect(p.rows.map((r) => r.kind)).toEqual(['IN', 'OUT', 'IN']);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Scans');
    sheet.addRow(['employee_code', 'datetime', 'type']);
    sheet.addRow(['72', new Date(Date.UTC(2026, 10, 16, 8, 15, 0)), 'IN']);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
    const px = await previewOk(s.token, xlsx, { format: 'GENERIC' }, 'scans.xlsx');
    expect(px.rows[0]).toMatchObject({ status: 'OK', localDateTime: '2026-11-16 08:15:00', kind: 'IN' });

    const hip = await preview(s.token, xlsx, { format: 'HIP' }, 'scans.xlsx');
    expect(hip.statusCode).toBe(415);
    expect(hip.json().error.code).toBe('scan_format_needs_text');
  });

  it('rejects confirm with another file, format or branch, a forged token, and changed data (FR-ATT-02.6)', async () => {
    const s = await setup();
    const file = generic(['S1,2026-11-16,08:00']);
    const p = await previewOk(s.token, file);
    const code = async (res: Awaited<ReturnType<typeof confirm>>) => [res.statusCode, res.json().error.code];

    expect(await code(await confirm(s.token, generic(['S1,2026-11-16,09:00']), p.importToken!))).toEqual([409, 'import_preview_mismatch']);
    expect(await code(await confirm(s.token, file, p.importToken!, { format: 'ZKTECO' }))).toEqual([409, 'import_preview_mismatch']);
    expect(await code(await confirm(s.token, file, p.importToken!, { format: 'GENERIC', branchId: s.branchId }))).toEqual([409, 'import_preview_mismatch']);
    const [body] = p.importToken!.split('.');
    expect(await code(await confirm(s.token, file, `${body}.forged`))).toEqual([409, 'import_preview_mismatch']);

    // A punch stored after the preview turns the row into a DUPLICATE: the reviewed table no longer holds.
    const other = await previewOk(s.token, file);
    expect((await confirm(s.token, file, other.importToken!)).statusCode).toBe(201);
    expect(await code(await confirm(s.token, file, p.importToken!))).toEqual([409, 'scan_import_changed']);
    expect(await punches(s)).toHaveLength(1);
  });

  it('validates the fields and the file', async () => {
    const s = await setup();
    expect((await preview(s.token, generic(['S1,2026-11-16,08:00']), { format: 'PDF' })).json().error.code).toBe('validation_error');
    expect((await preview(s.token, Buffer.from('name,when\nx,y'))).json().error.code).toBe('scan_missing_columns');
    expect((await preview(s.token, Buffer.from('employee_code,date,time\n'))).json().error.code).toBe('scan_import_empty');
    expect((await preview(s.token, Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]))).statusCode).toBe(415);
    // The row limit is the employee import's parameter (no new parameter).
    await t.db.tenant(s.ws.workspaceId, (tx) =>
      tx.workspaceParameter.create({ data: { workspaceId: s.ws.workspaceId, key: 'employee.importMaxRows', value: 2, effectiveFrom: new Date('2000-01-01') } }),
    );
    const tooMany = await preview(s.token, generic(['S1,2026-11-16,08:00', 'S1,2026-11-16,12:00', 'S1,2026-11-16,17:00']));
    expect([tooMany.statusCode, tooMany.json().error.code]).toEqual([400, 'import_too_many_rows']);
  });

  it('downloads the generic template as CSV and Excel', async () => {
    const s = await setup();
    const csv = await t.app.inject({ method: 'GET', url: api('/attendance/scan-imports/template?format=csv'), headers: bearer(s.token) });
    expect(csv.statusCode).toBe(200);
    expect(csv.body.replace(/^\uFEFF/, '').trim()).toBe('employee_code,date,time,type');
    const xlsx = await t.app.inject({ method: 'GET', url: api('/attendance/scan-imports/template'), headers: bearer(s.token) });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers['content-disposition']).toContain('scan-import-template.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.rawPayload as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Scans', 'Guide']);
  });
});

describe('scanner import permission and tenant isolation', () => {
  it('requires scan.import', async () => {
    const s = await setup();
    await createUser(t.db, s.ws, { email: `mgr@${s.ws.code}.test`, password: 'Manager1234', role: 'MANAGER' });
    const mgr = (await loginAs(t.app, s.ws.code, `mgr@${s.ws.code}.test`, 'Manager1234')).accessToken;
    expect((await preview(mgr, generic(['S1,2026-11-16,08:00']))).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'GET', url: api('/attendance/scan-imports'), headers: bearer(mgr) })).statusCode).toBe(403);
  });

  it('never matches, lists or accepts another workspace’s employees, branches, imports or tokens', async () => {
    const a = await setup('T');
    const b = await setup('U');
    const file = generic(['T1,2026-11-16,08:00']);
    const pa = await previewOk(a.token, file);
    expect((await confirm(a.token, file, pa.importToken!)).statusCode).toBe(201);

    // Workspace B does not see A's employee codes, branch, history or token.
    expect(statuses(await previewOk(b.token, file))).toEqual(['2:UNMATCHED:scan_employee_not_found']);
    expect((await preview(b.token, file, { format: 'GENERIC', branchId: a.branchId })).statusCode).toBe(404);
    const history = await t.app.inject({ method: 'GET', url: api('/attendance/scan-imports'), headers: bearer(b.token) });
    expect(history.json<Paginated<ScanImportSummary>>().total).toBe(0);
    const bFile = generic(['U1,2026-11-16,08:00']);
    const pb = await previewOk(b.token, bFile);
    expect((await confirm(a.token, bFile, pb.importToken!)).json().error.code).toBe('import_preview_mismatch');
  });
});
