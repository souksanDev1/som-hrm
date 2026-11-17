import { randomBytes } from 'node:crypto';
import { EMPLOYEE_IMPORT_COLUMNS, type EmployeeImportError, type EmployeeImportPreview } from '@hrm/shared';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { columnHeader, parseCsv, zipUncompressedSize } from '../src/modules/employees/employee-import.file';
import { managerFirstOrder } from '../src/modules/employees/employee-import.service';
import {
  api, bearer, createTestContext, createUser, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD,
  type TestContext, type WorkspaceFixture,
} from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

// ─────────────────────────── helpers ───────────────────────────

const HEADERS = ['employeeCode', 'firstName', 'lastName', 'gender', 'hireDate', 'contractType', 'payType'];
const csv = (rows: (string | number)[][], headers = HEADERS) =>
  Buffer.from([headers, ...rows].map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n'));
const row = (code: string, extra: (string | number)[] = []) => [code, 'ສົມ', 'ດີ', 'MALE', '2024-01-15', 'INDEFINITE', 'MONTHLY', ...extra];

const multipart = (fileName: string, content: Buffer, fields: Record<string, string> = {}) => {
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

const preview = (token: string, content: Buffer, fileName = 'staff.csv') => {
  const { payload, headers } = multipart(fileName, content);
  return t.app.inject({ method: 'POST', url: api('/employees/import/preview'), headers: { ...bearer(token), ...headers }, payload });
};
const confirm = (token: string, content: Buffer, importToken: string, fileName = 'staff.csv') => {
  const { payload, headers } = multipart(fileName, content, { importToken });
  return t.app.inject({ method: 'POST', url: api('/employees/import/confirm'), headers: { ...bearer(token), ...headers }, payload });
};
const previewOk = async (token: string, content: Buffer, fileName?: string) => {
  const res = await preview(token, content, fileName);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<EmployeeImportPreview>();
};

const ownerToken = async (ws: WorkspaceFixture) => (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
const post = (token: string, url: string, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'POST', url: api(url), headers: bearer(token), payload });

const count = (ws: WorkspaceFixture) => t.db.tenant(ws.workspaceId, (tx) => tx.employee.count({ where: { workspaceId: ws.workspaceId } }));
const audits = (ws: WorkspaceFixture, action: string) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { workspaceId: ws.workspaceId, action } }));
const errorsOf = (p: { errors: EmployeeImportError[] }) => p.errors.map((e) => `${e.row}:${e.column}:${e.code}`);

const setup = async (seatLimit?: number) => {
  const ws = await createWorkspace(t.db, seatLimit);
  return { ws, token: await ownerToken(ws) };
};

const xlsx = async (rows: ExcelJS.CellValue[][]) => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Employees');
  for (const r of rows) sheet.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
};

// ─────────────────────────── tests ───────────────────────────

describe('employee import file parsing', () => {
  it('reads quoted CSV fields, escaped quotes, CRLF and semicolon separators', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\n"multi\nline",2')).toEqual([['a', 'b'], ['multi\nline', '2']]);
  });

  it('reads the declared uncompressed size of a ZIP (zip-bomb guard) and rejects non-ZIPs', async () => {
    const buf = await xlsx([['a']]);
    expect(zipUncompressedSize(buf)).toBeGreaterThan(buf.length);
    expect(zipUncompressedSize(Buffer.from('not a zip at all, definitely not'))).toBeNull();
  });
});

describe('GET /employees/import/template', () => {
  it('serves CSV and xlsx templates with Lao + English headers that import back as an empty file', async () => {
    const { token } = await setup();
    const csvRes = await t.app.inject({ method: 'GET', url: api('/employees/import/template?format=csv'), headers: bearer(token) });
    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.headers['content-disposition']).toContain('employee-import-template.csv');
    const text = csvRes.rawPayload.toString('utf8');
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toContain('ລະຫັດພະນັກງານ / Employee code *');

    const xRes = await t.app.inject({ method: 'GET', url: api('/employees/import/template'), headers: bearer(token) });
    expect(xRes.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xRes.rawPayload as unknown as ArrayBuffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Employees', 'Codes']);
    const header = (wb.worksheets[0]!.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual(EMPLOYEE_IMPORT_COLUMNS.map(columnHeader));

    for (const file of [csvRes.rawPayload, xRes.rawPayload]) {
      const res = await preview(token, file);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('import_empty');
    }
  });
});

describe('preview + confirm (CSV)', () => {
  it('previews without writing, then creates every row with resolved references and audit entries', async () => {
    const { ws, token } = await setup();
    await post(token, '/branches', { name: 'Vientiane HQ' });
    const dept = (await post(token, '/departments', { name: 'Finance' })).json<{ id: string }>();
    await post(token, '/positions', { name: 'Accountant' });
    const boss = (await post(token, '/employees', employeePayload({ employeeCode: 'BOSS1' }))).json<{ employee: { id: string } }>().employee;
    const before = await count(ws);
    const auditBefore = (await audits(ws, 'employee.created')).length;

    const file = csv(
      [
        row('IMP-1', ['vientiane hq', dept.id, 'Accountant', 'BOSS1', '+856 20 5555 1234', 'yes']),
        // Manager defined by an earlier row of the same file.
        row('IMP-2', ['Vientiane HQ', 'Finance', '', 'IMP-1', '', 'no']),
      ],
      [...HEADERS, 'branch', 'department', 'position', 'managerCode', 'phone', 'hazardousWork'],
    );
    const p = await previewOk(token, file);
    expect(p).toMatchObject({ rows: 2, errors: [] });
    expect(p.importToken).toEqual(expect.any(String));
    expect(p.sample.map((s) => s.values.employeeCode)).toEqual(['IMP-1', 'IMP-2']);
    expect(p.sample[0]!.values).toMatchObject({ branch: 'vientiane hq', hireDate: '2024-01-15' });
    // Preview does not write: no employees, no audit entries.
    expect(await count(ws)).toBe(before);
    expect(await audits(ws, 'employee.created')).toHaveLength(auditBefore);

    const res = await confirm(token, file, p.importToken!);
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toEqual({ created: 2 });
    const rows = await t.db.tenant(ws.workspaceId, (tx) =>
      tx.employee.findMany({ where: { employeeCode: { in: ['IMP-1', 'IMP-2'] } }, orderBy: { employeeCode: 'asc' }, include: { branch: true, position: true } }),
    );
    expect(rows.map((r) => [r.branch?.name, r.departmentId, r.position?.name ?? null, r.phone, r.hazardousWork])).toEqual([
      ['Vientiane HQ', dept.id, 'Accountant', '02055551234', true],
      ['Vientiane HQ', dept.id, null, null, false],
    ]);
    expect(rows[0]!.managerId).toBe(boss.id);
    expect(rows[1]!.managerId).toBe(rows[0]!.id);
    // Same create path: HIRED history, one audit per employee, plus the import summary.
    const history = await t.db.tenant(ws.workspaceId, (tx) => tx.employmentHistory.count({ where: { employeeId: { in: rows.map((r) => r.id) }, changeType: 'HIRED' } }));
    expect(history).toBe(2);
    expect((await audits(ws, 'employee.created')).filter((a) => rows.some((r) => r.id === a.entityId))).toHaveLength(2);
    const summary = await audits(ws, 'employee.imported');
    expect(summary).toHaveLength(1);
    expect(summary[0]!.meta).toMatchObject({ rows: 2, fileName: 'staff.csv' });
  });

  it('accepts Lao-only or English-only headers and enum codes in any case', async () => {
    const { ws, token } = await setup();
    const file = csv([['L-1', 'ນາງ', 'ແກ້ວ', 'female', '2024-02-01', 'fixed_term', 'daily', '2025-02-01']], [
      'ລະຫັດພະນັກງານ', 'First name', 'ນາມສະກຸນ', 'Gender', 'ວັນເຂົ້າວຽກ', 'Contract type', 'Pay type', 'Contract end date',
    ]);
    const p = await previewOk(token, file);
    expect(p.errors).toEqual([]);
    expect((await confirm(token, file, p.importToken!)).statusCode).toBe(201);
    const e = await t.db.tenant(ws.workspaceId, (tx) => tx.employee.findFirstOrThrow({ where: { employeeCode: 'L-1' } }));
    expect([e.gender, e.contractType, e.payType]).toEqual(['FEMALE', 'FIXED_TERM', 'DAILY']);
  });
});

describe('managers in any row order', () => {
  it('orders managers before their reports and finds reporting cycles', () => {
    expect(managerFirstOrder([{ code: 'A', managerCode: 'B' }, { code: 'B', managerCode: 'C' }, { code: 'C' }])).toEqual({ order: [2, 1, 0], cyclic: new Set() });
    // Managers outside the file (or none) keep the file order.
    expect(managerFirstOrder([{ code: 'A', managerCode: 'BOSS' }, { code: 'B' }]).order).toEqual([0, 1]);
    const loop = managerFirstOrder([{ code: 'X', managerCode: 'Y' }, { code: 'Y', managerCode: 'X' }, { code: 'Z', managerCode: 'Z' }, { code: 'W', managerCode: 'X' }]);
    expect(loop.cyclic).toEqual(new Set([0, 1, 2]));
    expect([...loop.order].sort()).toEqual([0, 1, 2, 3]);
  });

  it('imports a file whose managers come after their reports', async () => {
    const { ws, token } = await setup();
    const headers = [...HEADERS, 'managerCode'];
    const file = csv([row('ANY-3', ['ANY-2']), row('ANY-2', ['ANY-1']), row('ANY-1', [''])], headers);
    const p = await previewOk(token, file);
    expect(p.errors).toEqual([]);
    expect((await confirm(token, file, p.importToken!)).statusCode).toBe(201);
    const byCode = new Map(
      (await t.db.tenant(ws.workspaceId, (tx) => tx.employee.findMany({ where: { employeeCode: { startsWith: 'ANY-' } } }))).map((e) => [e.employeeCode, e]),
    );
    expect(byCode.get('ANY-1')!.managerId).toBeNull();
    expect(byCode.get('ANY-2')!.managerId).toBe(byCode.get('ANY-1')!.id);
    expect(byCode.get('ANY-3')!.managerId).toBe(byCode.get('ANY-2')!.id);
  });

  it('rejects reporting loops and reports errors in file order', async () => {
    const { token } = await setup();
    const file = csv([row('CYC-1', ['CYC-2']), row('CYC-2', ['CYC-1']), row('SELF', ['SELF']), row('CYC-1', [''])], [...HEADERS, 'managerCode']);
    const p = await previewOk(token, file);
    expect(errorsOf(p)).toEqual(['2:managerCode:manager_cycle', '3:managerCode:manager_cycle', '4:managerCode:manager_cycle', '5:employeeCode:duplicate_in_file']);
    expect(p.importToken).toBeNull();
  });
});

describe('preview errors', () => {
  it('reports header problems on row 1', async () => {
    const { token } = await setup();
    const p = await previewOk(token, csv([row('H-1')], ['employeeCode', 'firstName', 'gender', 'gender', 'hireDate', 'contractType', 'payType', 'Salary']));
    expect(errorsOf(p)).toEqual(['1:gender:duplicate_column', '1:Salary:unknown_column', '1:lastName:missing_column']);
    expect(p.importToken).toBeNull();
  });

  it('reports every row error with row number, column and code — and saves nothing', async () => {
    const { ws, token } = await setup();
    await post(token, '/branches', { name: 'Open branch' });
    const closed = (await post(token, '/departments', { name: 'Closed dept' })).json<{ id: string }>();
    await post(token, `/departments/${closed.id}/close`, {});
    await post(token, '/employees', employeePayload({ employeeCode: 'TAKEN', idCardNo: 'ID-TAKEN-1', socialSecurityNo: 'SSN000111' }));
    const before = await count(ws);

    const headers = [...HEADERS, 'branch', 'department', 'position', 'managerCode', 'idCardNo', 'socialSecurityNo', 'nationalityType', 'contractEndDate'];
    const file = csv(
      [
        /* 2 */ row('OK-1', ['', '', '', '', 'ID-A', 'SSN000222', '', '']),
        /* 3 */ ['OK-2', '', 'X', 'ROBOT', '2024-13-40', 'INDEFINITE', 'WEEKLY', '', '', '', '', '', '', '', ''],
        /* 4 */ row('OK-3', ['Nowhere', 'No dept', 'No pos', 'NOBODY', '', '', '', '']),
        /* 5 */ row('OK-4', ['', 'Closed dept', '', '', '', '', '', '']),
        /* 6 */ row('OK-1', ['', '', '', '', 'id-a', 'SSN-000222', '', '']),
        /* 7 */ row('TAKEN', ['', '', '', '', 'ID-TAKEN-1', 'SSN000111', '', '']),
        /* 8 */ row('OK-5', ['', '', '', '', '', '', 'FOREIGN', '2023-01-01']),
        /* 9 */ row('=HYPERLINK("http://x")', ['@SUM(1)', '', '', '', '', '', '', '']),
        /* 10 */ ['OK-6', 'ສົມ', 'ດີ', 'MALE', '2024-01-15', 'FIXED_TERM', 'MONTHLY', '', '', '', '', '', '', '', ''],
      ],
      headers,
    );
    const p = await previewOk(token, file);
    expect(p.rows).toBe(9);
    expect(errorsOf(p)).toEqual([
      '3:firstName:required',
      '3:gender:invalid_option',
      '3:hireDate:invalid_date',
      '3:payType:invalid_option',
      '4:branch:unknown_reference',
      '4:department:unknown_reference',
      '4:position:unknown_reference',
      '4:managerCode:unknown_reference',
      '5:department:org_unit_closed',
      '6:employeeCode:duplicate_in_file',
      '6:idCardNo:duplicate_in_file',
      '6:socialSecurityNo:duplicate_in_file',
      '7:employeeCode:employee_code_taken',
      '8:nationality:nationality_required',
      '8:contractEndDate:before_hire_date',
      '9:employeeCode:formula_not_allowed',
      '9:branch:formula_not_allowed',
      '10:contractEndDate:contract_end_required',
    ]);
    expect(p.importToken).toBeNull();
    // Every error row is in the sample, but identity numbers are never echoed back.
    expect(new Set(p.sample.map((s) => s.row))).toEqual(new Set([2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(JSON.stringify(p.sample)).not.toContain('SSN000');
    expect(await count(ws)).toBe(before);
  });

  it('reports existing national ID and social security duplicates on their own columns', async () => {
    const { token } = await setup();
    await post(token, '/employees', employeePayload({ idCardNo: 'ID-77', socialSecurityNo: 'SSN777777' }));
    const p1 = await previewOk(token, csv([row('D-1', ['ID 77'])], [...HEADERS, 'idCardNo']));
    expect(errorsOf(p1)).toEqual(['2:idCardNo:duplicate_national_id']);
    const p2 = await previewOk(token, csv([row('D-2', ['SSN777777'])], [...HEADERS, 'socialSecurityNo']));
    expect(errorsOf(p2)).toEqual(['2:socialSecurityNo:duplicate_social_security_no']);
  });

  it('rejects files that are not xlsx/CSV, unreadable ZIPs and files over the row limit', async () => {
    const { ws, token } = await setup();
    const pdf = await preview(token, Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from([0, 1, 2, 3])]), 'x.pdf');
    expect(pdf.statusCode).toBe(415);
    expect(pdf.json().error.code).toBe('unsupported_import_file');

    const zip = await preview(token, Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), randomBytes(64)]), 'x.xlsx');
    expect(zip.statusCode).toBe(400);
    expect(zip.json().error.code).toBe('invalid_import_file');

    await t.db.tenant(ws.workspaceId, (tx) =>
      tx.workspaceParameter.create({ data: { workspaceId: ws.workspaceId, key: 'employee.importMaxRows', value: 2, effectiveFrom: new Date('2000-01-01') } }),
    );
    const many = await preview(token, csv([row('R-1'), row('R-2'), row('R-3')]));
    expect(many.statusCode).toBe(400);
    expect(many.json().error).toMatchObject({ code: 'import_too_many_rows', details: { max: 2 } });
    expect((await preview(token, csv([row('R-1'), [], row('R-2')]))).statusCode).toBe(200);
  });
});

describe('xlsx import', () => {
  it('reads date cells, Excel serial dates and numeric cells; rejects formula cells', async () => {
    const { ws, token } = await setup();
    const headers = [...HEADERS, 'dateOfBirth', 'phone'];
    const file = await xlsx([
      headers,
      ['X-1', 'ສົມ', 'ດີ', 'MALE', new Date(Date.UTC(2024, 0, 15)), 'INDEFINITE', 'MONTHLY', 32874, 2055551234],
      ['X-2', 'ສົມ', 'ດີ', 'MALE', 45306, 'INDEFINITE', 'MONTHLY', null, null],
    ]);
    const p = await previewOk(token, file, 'staff.xlsx');
    expect(p.errors).toEqual([]);
    expect((await confirm(token, file, p.importToken!, 'staff.xlsx')).statusCode).toBe(201);
    const rows = await t.db.tenant(ws.workspaceId, (tx) => tx.employee.findMany({ where: { employeeCode: { in: ['X-1', 'X-2'] } }, orderBy: { employeeCode: 'asc' } }));
    expect(rows.map((r) => [r.hireDate.toISOString().slice(0, 10), r.dateOfBirth?.toISOString().slice(0, 10) ?? null, r.phone])).toEqual([
      ['2024-01-15', '1990-01-01', '02055551234'],
      ['2024-01-15', null, null],
    ]);

    const withFormula = await xlsx([HEADERS, ['F-1', { formula: 'A1&"x"', result: 'ສົມ' }, 'ດີ', 'MALE', '2024-01-15', 'INDEFINITE', 'MONTHLY']]);
    expect(errorsOf(await previewOk(token, withFormula, 'f.xlsx'))).toEqual(['2:firstName:formula_not_allowed']);
  });
});

describe('confirm safety', () => {
  const validFile = (code: string) => csv([row(`${code}-1`), row(`${code}-2`)]);

  it('rejects a tampered file, a forged token and another user’s token', async () => {
    const { ws, token } = await setup();
    const file = validFile('T');
    const p = await previewOk(token, file);
    const tampered = csv([row('T-1'), row('T-2'), row('T-3')]);
    for (const [content, tok] of [
      [tampered, p.importToken!],
      [file, `${p.importToken!.split('.')[0]}.AAAA`],
      [file, 'garbage'],
      [file, ''],
    ] as const) {
      const res = await confirm(token, content, tok);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('import_preview_mismatch');
    }
    await createUser(t.db, ws, { email: 'hr@imp.test', password: 'Hr12345678', role: 'HR_ADMIN' });
    const hr = (await loginAs(t.app, ws.code, 'hr@imp.test', 'Hr12345678')).accessToken;
    expect((await confirm(hr, file, p.importToken!)).json().error.code).toBe('import_preview_mismatch');
    expect(await count(ws)).toBe(0);
  });

  it('rejects an expired preview', async () => {
    const { ws, token } = await setup();
    const file = validFile('E');
    const p = await previewOk(token, file);
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 31 * 60 * 1000 });
    try {
      // Sign in again "later" so only the import token is stale, not the access token.
      const res = await confirm(await ownerToken(ws), file, p.importToken!);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('import_preview_expired');
    } finally {
      vi.useRealTimers();
    }
    expect(await count(ws)).toBe(0);
  });

  it('re-validates on confirm and creates nothing when data changed since the preview (all-or-nothing)', async () => {
    const { ws, token } = await setup();
    const file = validFile('S');
    const p = await previewOk(token, file);
    // Someone takes the second code after the preview.
    expect((await post(token, '/employees', employeePayload({ employeeCode: 'S-2' }))).statusCode).toBe(201);
    const res = await confirm(token, file, p.importToken!);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'import_invalid', details: { errors: [{ row: 3, column: 'employeeCode', code: 'employee_code_taken' }] } });
    const codes = await t.db.tenant(ws.workspaceId, (tx) => tx.employee.findMany({ select: { employeeCode: true } }));
    expect(codes.map((c) => c.employeeCode)).toEqual(['S-2']);
    expect(await audits(ws, 'employee.imported')).toHaveLength(0);
  });

  it('respects the seat limit in preview and confirm', async () => {
    const { ws, token } = await setup(2);
    const three = csv([row('Q-1'), row('Q-2'), row('Q-3')]);
    expect(errorsOf(await previewOk(token, three))).toEqual(['4:null:seat_limit_reached']);
    // Resigned staff do not take a seat.
    const withResigned = csv([row('Q-1'), row('Q-2'), [...row('Q-3'), 'RESIGNED']], [...HEADERS, 'status']);
    expect((await previewOk(token, withResigned)).errors).toEqual([]);

    const two = csv([row('Q-1'), row('Q-2')]);
    const p = await previewOk(token, two);
    expect((await post(token, '/employees', employeePayload())).statusCode).toBe(201);
    const res = await confirm(token, two, p.importToken!);
    expect(res.json().error).toMatchObject({ code: 'import_invalid', details: { errors: [{ row: 3, column: null, code: 'seat_limit_reached' }] } });
    expect(await count(ws)).toBe(1);
  });
});

describe('tenant isolation and permissions', () => {
  it('never resolves references or detects duplicates across workspaces, nor accepts a token from another workspace', async () => {
    const a = await setup();
    const b = await setup();
    await post(b.token, '/branches', { name: 'B only' });
    await post(b.token, '/employees', employeePayload({ employeeCode: 'BMGR', idCardNo: 'ID-B-1' }));

    const refs = await previewOk(a.token, csv([row('A-1', ['B only', 'BMGR'])], [...HEADERS, 'branch', 'managerCode']));
    expect(errorsOf(refs)).toEqual(['2:branch:unknown_reference', '2:managerCode:unknown_reference']);
    // The same code and ID card as workspace B are fine in workspace A.
    const file = csv([row('BMGR', ['ID-B-1'])], [...HEADERS, 'idCardNo']);
    const p = await previewOk(a.token, file);
    expect(p.errors).toEqual([]);
    expect((await confirm(b.token, file, p.importToken!)).json().error.code).toBe('import_preview_mismatch');
    expect((await confirm(a.token, file, p.importToken!)).statusCode).toBe(201);
    expect(await count(a.ws)).toBe(1);
    expect(await count(b.ws)).toBe(1);
  });

  it('requires employee.import for template, preview and confirm, not just employee.write', async () => {
    const { ws } = await setup();
    const file = csv([row('P-0')]);
    // Every role in the workspace keeps employee.write but loses employee.import; sign in again for fresh permissions.
    await t.db.system((tx) =>
      tx.rolePermission.deleteMany({ where: { workspaceId: ws.workspaceId, permission: { key: 'employee.import' } } }),
    );
    const owner = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
    expect((await t.app.inject({ method: 'POST', url: api('/employees'), headers: bearer(owner), payload: employeePayload({ employeeCode: 'W-1' }) })).statusCode).toBe(201);
    expect((await t.app.inject({ method: 'GET', url: api('/employees/import/template'), headers: bearer(owner) })).statusCode).toBe(403);
    expect((await preview(owner, file)).statusCode).toBe(403);
    expect((await confirm(owner, file, 'x')).statusCode).toBe(403);
  });

  it('forbids roles without employee.import (manager) and anonymous callers', async () => {
    const { ws } = await setup();
    await createUser(t.db, ws, { email: 'mgr@imp.test', password: 'Mgr12345678', role: 'MANAGER' });
    const mgr = (await loginAs(t.app, ws.code, 'mgr@imp.test', 'Mgr12345678')).accessToken;
    const file = csv([row('P-1')]);
    expect((await t.app.inject({ method: 'GET', url: api('/employees/import/template'), headers: bearer(mgr) })).statusCode).toBe(403);
    expect((await preview(mgr, file)).statusCode).toBe(403);
    expect((await confirm(mgr, file, 'x')).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'POST', url: api('/employees/import/preview'), ...multipart('a.csv', file) })).statusCode).toBe(401);
  });
});
