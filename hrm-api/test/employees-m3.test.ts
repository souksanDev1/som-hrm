import type { CreateEmployeeResponse, EmployeeDetail, EmploymentHistoryEntry, ExpiringDocument, Paginated } from '@hrm/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseIsoDate, todayInTimeZone } from '../src/lib/dates';
import { employeesRepository } from '../src/modules/employees/employees.repository';
import {
  api, bearer, createTestContext, createUser, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD,
  type TestContext, type WorkspaceFixture,
} from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());
afterEach(() => vi.restoreAllMocks());

const ownerSession = async (ws: WorkspaceFixture) => (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', token: string, url: string, payload?: object) =>
  t.app.inject({ method, url: api(url), headers: bearer(token), payload });
const createEmployee = async (token: string, overrides: Record<string, unknown> = {}) => {
  const res = await req('POST', token, '/employees', employeePayload(overrides));
  if (res.statusCode !== 201) throw new Error(`create failed: ${res.statusCode} ${res.body}`);
  return res.json<CreateEmployeeResponse>().employee;
};
const sessionAs = async (ws: WorkspaceFixture, role: string, employeeId?: string) => {
  const email = `${role.toLowerCase()}-${randomUUID().slice(0, 6)}@x.test`;
  await createUser(t.db, ws, { email, password: 'Passw0rd1', role, employeeId });
  return (await loginAs(t.app, ws.code, email, 'Passw0rd1')).accessToken;
};
const addDays = (iso: string, days: number) => new Date(parseIsoDate(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const auditOf = (ws: WorkspaceFixture, entityId: string) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } }));

describe('FR-EMP-01/02/03: personal, Lao document and employment fields', () => {
  const full = {
    firstName: 'ສົມໃຈ', lastName: 'ດວງດີ', firstNameEn: 'Somchai', lastNameEn: 'Douangdy',
    address: 'ເຮືອນເລກທີ 12', village: 'ໂພນທັນ', district: 'ໄຊເສດຖາ', province: 'VT',
    idCardNo: 'ID-900-100', familyBookNo: 'VT-778899', familyBookHolder: 'ທ້າວ ບຸນມີ ດວງດີ',
    socialSecurityNo: 'SS9001001', ssnRegisteredAt: '2024-02-01',
    hireDate: '2024-01-15', contractType: 'FIXED_TERM', contractEndDate: '2026-01-14', probationEndDate: '2024-04-14', payType: 'DAILY',
  };

  it('stores and returns the new fields; sensitive numbers stay masked without employee.sensitive.read', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const mgrEmp = await createEmployee(token, { employeeCode: 'MGR' });
    const e = await createEmployee(token, { ...full, managerId: mgrEmp.id });
    expect(e).toMatchObject({ ...full, sensitiveMasked: false });

    const raw = await t.db.tenant(ws.workspaceId, (tx) => tx.employee.findUniqueOrThrow({ where: { id: e.id } }));
    expect(raw.familyBookNoEnc).not.toContain('778899');

    const manager = await sessionAs(ws, 'MANAGER', mgrEmp.id);
    const seen = (await req('GET', manager, `/employees/${e.id}`)).json<EmployeeDetail>();
    expect(seen).toMatchObject({ sensitiveMasked: true, socialSecurityNo: '•••••1001', familyBookNo: '•••••8899', idCardNo: '••••••-100' });
    // Non-identifier fields are not masked.
    expect(seen).toMatchObject({ ssnRegisteredAt: '2024-02-01', familyBookHolder: full.familyBookHolder, province: 'VT', firstNameEn: 'Somchai' });

    // The English name is searchable.
    const found = (await req('GET', token, '/employees?search=douang')).json<Paginated<{ id: string; lastNameEn: string }>>();
    expect(found.items.map((x) => x.id)).toEqual([e.id]);
    expect(found.items[0]!.lastNameEn).toBe('Douangdy');
  });

  it('clears the new optional fields with null / "" and keeps omitted ones', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const e = await createEmployee(token, full);
    const res = await req('PATCH', token, `/employees/${e.id}`, {
      firstNameEn: null, village: '', province: null, familyBookHolder: null, ssnRegisteredAt: null, contractEndDate: '', probationEndDate: null,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<EmployeeDetail>()).toMatchObject({
      firstNameEn: null, lastNameEn: 'Douangdy', village: null, district: 'ໄຊເສດຖາ', province: null,
      familyBookHolder: null, ssnRegisteredAt: null, contractEndDate: null, probationEndDate: null, contractType: 'FIXED_TERM', payType: 'DAILY',
    });
  });

  it('validates province codes and end dates against the stored hire date', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const bad = await req('POST', token, '/employees', employeePayload({ province: 'Narnia' }));
    expect(bad.statusCode).toBe(400);
    const e = await createEmployee(token, { hireDate: '2024-01-15' });
    const early = await req('PATCH', token, `/employees/${e.id}`, { contractEndDate: '2023-12-31' });
    expect(early.statusCode).toBe(400);
    expect(early.json().error).toMatchObject({ code: 'before_hire_date', details: { fields: ['contractEndDate'] } });
    // Moving the hire date after a stored probation end date is rejected too.
    expect((await req('PATCH', token, `/employees/${e.id}`, { probationEndDate: '2024-03-01' })).statusCode).toBe(200);
    const moved = await req('PATCH', token, `/employees/${e.id}`, { hireDate: '2024-06-01' });
    expect(moved.json().error).toMatchObject({ code: 'before_hire_date', details: { fields: ['probationEndDate'] } });
  });

  it('rejects the retired employmentType field and missing contract/pay type', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const { contractType: _c, payType: _p, ...legacy } = employeePayload({ employmentType: 'FULL_TIME' });
    expect((await req('POST', token, '/employees', legacy)).statusCode).toBe(400);
  });
});

describe('FR-EMP-08: employment history with effective dates', () => {
  it('records position, branch/department, manager, contract and pay changes with names and the chosen effective date', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const post = async (url: string, body: object) => (await req('POST', token, url, body)).json<{ id: string }>();
    const [branch, dept, pos] = [await post('/branches', { name: 'Pakse' }), await post('/departments', { name: 'Ops' }), await post('/positions', { name: 'Lead' })];
    const boss = await createEmployee(token, { employeeCode: 'BOSS', firstName: 'ນາຍ', lastName: 'ໃຫຍ່' });
    const e = await createEmployee(token, { hireDate: '2024-01-15' });

    const patch = await req('PATCH', token, `/employees/${e.id}`, {
      positionId: pos.id, branchId: branch.id, departmentId: dept.id, managerId: boss.id, effectiveDate: '2025-03-01',
    });
    expect(patch.statusCode).toBe(200);
    expect((await req('PATCH', token, `/employees/${e.id}`, { contractType: 'INDEFINITE', payType: 'HOURLY' })).statusCode).toBe(200);
    // Untracked field changes do not create history.
    expect((await req('PATCH', token, `/employees/${e.id}`, { firstNameEn: 'Noy', effectiveDate: '2025-04-01' })).statusCode).toBe(200);

    const page = (await req('GET', token, `/employees/${e.id}/history`)).json<Paginated<EmploymentHistoryEntry>>();
    expect(page.items.map((h) => h.effectiveDate)).toEqual([todayInTimeZone('Asia/Vientiane'), '2025-03-01', '2024-01-15']);
    expect(page.items[0]).toMatchObject({
      fromValue: { payType: 'MONTHLY' }, // contractType was already INDEFINITE: not recorded
      toValue: { payType: 'HOURLY' },
    });
    expect(Object.keys(page.items[0]!.toValue!)).toEqual(['payType']);
    expect(page.items[1]).toMatchObject({
      fromValue: { positionId: null, branchId: null, departmentId: null, managerId: null },
      toValue: { positionId: pos.id, branchId: branch.id, departmentId: dept.id, managerId: boss.id },
      labels: { [pos.id]: 'Lead', [branch.id]: 'Pakse', [dept.id]: 'Ops', [boss.id]: 'ນາຍ ໃຫຍ່' },
    });
    expect(page.items[2]).toMatchObject({ changeType: 'HIRED', toValue: { contractType: 'INDEFINITE', payType: 'MONTHLY', status: 'PROBATION' } });
  });
});

describe('FR-EMP-01.5: emergency contacts', () => {
  it('adds, updates and removes a contact, auditing each with the contact id', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const e = await createEmployee(token);
    const added = (await req('POST', token, `/employees/${e.id}/emergency-contacts`, { name: 'ນາງ ດາ', relationship: 'ແມ່', phone: '020 5555 9191' }))
      .json<EmployeeDetail>();
    const contact = added.emergencyContacts[0]!;

    const updated = await req('PATCH', token, `/employees/${e.id}/emergency-contacts/${contact.id}`, { phone: '+856 20 5555 0000', relationship: 'ພໍ່' });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<EmployeeDetail>().emergencyContacts).toEqual([{ id: contact.id, name: 'ນາງ ດາ', relationship: 'ພໍ່', phone: '02055550000' }]);

    expect((await req('PATCH', token, `/employees/${e.id}/emergency-contacts/${contact.id}`, { phone: '123' })).statusCode).toBe(400);
    expect((await req('DELETE', token, `/employees/${e.id}/emergency-contacts/${contact.id}`)).statusCode).toBe(200);

    const audit = (await auditOf(ws, e.id)).filter((a) => a.action.startsWith('employee.contact_'));
    expect(audit.map((a) => [a.action, a.meta])).toEqual([
      ['employee.contact_added', { contactId: contact.id }],
      ['employee.contact_updated', { contactId: contact.id, fields: ['relationship', 'phone'] }],
      ['employee.contact_removed', { contactId: contact.id }],
    ]);
  });

  it('only updates a contact of that employee, in that workspace, with employee.write', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const a = await createEmployee(token);
    const b = await createEmployee(token);
    const contact = (await req('POST', token, `/employees/${a.id}/emergency-contacts`, { name: 'X', relationship: 'Y', phone: '02055559191' }))
      .json<EmployeeDetail>().emergencyContacts[0]!;
    expect((await req('PATCH', token, `/employees/${b.id}/emergency-contacts/${contact.id}`, { name: 'Z' })).statusCode).toBe(404);
    const other = await ownerSession(await createWorkspace(t.db));
    expect((await req('PATCH', other, `/employees/${a.id}/emergency-contacts/${contact.id}`, { name: 'Z' })).statusCode).toBe(404);
    const manager = await sessionAs(ws, 'MANAGER', a.id);
    expect((await req('PATCH', manager, `/employees/${a.id}/emergency-contacts/${contact.id}`, { name: 'Z' })).statusCode).toBe(403);
  });
});

describe('FR-EMP-10.2/10.3: duplicate SSN / ID card when a concurrent write wins the race', () => {
  it('maps the unique-index violation (P2002) to the specific code', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const first = await createEmployee(token, { socialSecurityNo: 'SS7007007', idCardNo: 'ID-7007' });
    // Simulate the race: the up-front check misses the concurrent row, the database index still rejects
    // the write, and the re-check after the savepoint rollback (real query) names the key.
    const spy = vi.spyOn(employeesRepository, 'findUniqueConflicts');
    const raceOnce = () => spy.mockResolvedValueOnce([]);

    raceOnce();
    const dupSsn = await req('POST', token, '/employees', employeePayload({ socialSecurityNo: 'ss7007007' }));
    expect(dupSsn.statusCode).toBe(409);
    expect(dupSsn.json().error.code).toBe('duplicate_social_security_no');

    const second = (await t.db.tenant(ws.workspaceId, (tx) => tx.employee.findMany({ where: { NOT: { id: first.id } } }))).length;
    expect(second).toBe(0); // the failed create rolled back

    const other = await createEmployee(token);
    raceOnce();
    const dupId = await req('PATCH', token, `/employees/${other.id}`, { idCardNo: 'id 7007' });
    expect(dupId.statusCode).toBe(409);
    expect(dupId.json().error.code).toBe('duplicate_national_id');

    raceOnce();
    const dupCode = await req('POST', token, '/employees', employeePayload({ employeeCode: other.employeeCode }));
    expect(dupCode.json().error.code).toBe('employee_code_taken');
    expect(spy).toHaveBeenCalledTimes(7) // 3 races x (mocked miss + real re-check) + the normal create;
    // The PATCH did not half-apply.
    expect((await req('GET', token, `/employees/${other.id}`)).json<EmployeeDetail>().idCardNo).toBeNull();
  });
});

describe('FR-EMP-04.4 / FR-EMP-06: residence permits and the expiring-documents overview', () => {
  const setup = async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const today = todayInTimeZone('Asia/Vientiane');
    const vte = (await req('POST', token, '/branches', { name: 'Vientiane' })).json<{ id: string }>();
    const pakse = (await req('POST', token, '/branches', { name: 'Pakse' })).json<{ id: string }>();
    const lead = await createEmployee(token, { employeeCode: 'LEAD', branchId: pakse.id });
    const worker = await createEmployee(token, { employeeCode: 'WRK', branchId: pakse.id, managerId: lead.id, nationalityType: 'FOREIGN', nationality: 'Vietnam' });
    const office = await createEmployee(token, { employeeCode: 'OFF', branchId: vte.id });
    const gone = await createEmployee(token, { employeeCode: 'GONE', branchId: vte.id, status: 'RESIGNED' });
    const doc = async (employeeId: string, type: string, number: string, offset: number | null) =>
      req('POST', token, `/employees/${employeeId}/documents`, { type, number, ...(offset === null ? {} : { expiresAt: addDays(today, offset) }) });
    await doc(worker.id, 'RESIDENCE_PERMIT', 'RP-EXP', -3);
    await doc(worker.id, 'WORK_PERMIT', 'WP-5', 5);
    await doc(worker.id, 'VISA', 'V-200', 200); // outside the 90-day window
    await doc(worker.id, 'PASSPORT', 'P-NOEXP', null);
    await doc(office.id, 'VISA', 'V-60', 60);
    await doc(gone.id, 'VISA', 'V-GONE', 1); // left the company: not listed
    return { ws, token, vte, pakse, lead, worker, office };
  };
  const list = async (token: string, query = '') => {
    const res = await req('GET', token, `/documents/expiring${query}`);
    expect(res.statusCode).toBe(200);
    return res.json<Paginated<ExpiringDocument>>();
  };

  it('lists expired and expiring documents soonest first, with API-computed status', async () => {
    const { token, worker } = await setup();
    const all = await list(token);
    expect(all.total).toBe(3);
    expect(all.items.map((d) => [d.number, d.expiryStatus, d.daysUntilExpiry, d.expiryThresholdDays])).toEqual([
      ['RP-EXP', 'EXPIRED', -3, null],
      ['WP-5', 'EXPIRING', 5, 7],
      ['V-60', 'EXPIRING', 60, 60],
    ]);
    expect(all.items[0]).toMatchObject({ type: 'RESIDENCE_PERMIT', employee: { id: worker.id, employeeCode: 'WRK', branch: { name: 'Pakse' } } });
  });

  it('filters by branch, document type and status, and paginates', async () => {
    const { token, vte, pakse } = await setup();
    expect((await list(token, `?branchId=${vte.id}`)).items.map((d) => d.number)).toEqual(['V-60']);
    expect((await list(token, `?branchId=${pakse.id}`)).items.map((d) => d.number)).toEqual(['RP-EXP', 'WP-5']);
    expect((await list(token, '?type=VISA')).items.map((d) => d.number)).toEqual(['V-60']);
    expect((await list(token, '?status=EXPIRED')).items.map((d) => d.number)).toEqual(['RP-EXP']);
    expect((await list(token, '?status=EXPIRING&type=WORK_PERMIT')).items.map((d) => d.number)).toEqual(['WP-5']);
    const p2 = await list(token, '?pageSize=2&page=2');
    expect([p2.total, p2.items.map((d) => d.number)]).toEqual([3, ['V-60']]);
    expect((await req('GET', token, '/documents/expiring?type=BOGUS')).statusCode).toBe(400);
  });

  it('honours the data scope: managers see their reporting line, employees are forbidden, other workspaces see nothing', async () => {
    const { ws, lead, worker } = await setup();
    const manager = await sessionAs(ws, 'MANAGER', lead.id);
    expect((await list(manager)).items.map((d) => d.number)).toEqual(['RP-EXP', 'WP-5']);
    const hr = await sessionAs(ws, 'HR_ADMIN');
    expect((await list(hr)).total).toBe(3);
    const self = await sessionAs(ws, 'EMPLOYEE', worker.id);
    expect((await req('GET', self, '/documents/expiring')).statusCode).toBe(403);
    expect((await list(await ownerSession(await createWorkspace(t.db)))).total).toBe(0);
  });
});
