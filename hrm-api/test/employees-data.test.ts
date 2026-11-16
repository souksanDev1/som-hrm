import type { CreateEmployeeResponse, EmployeeDetail, EmployeeSummary, EmploymentHistoryEntry, LoginResponse, Paginated } from '@hrm/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backfillPii } from '../scripts/backfill-pii';
import { createFieldCipher } from '../src/lib/crypto';
import { parseIsoDate, todayInTimeZone } from '../src/lib/dates';
import {
  api, bearer, createTestContext, createUser, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD,
  type TestContext, type WorkspaceFixture,
} from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const ownerSession = async (ws: WorkspaceFixture) => (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', token: string, url: string, payload?: object) =>
  t.app.inject({ method, url: api(url), headers: bearer(token), payload });
const createEmployee = async (token: string, overrides: Record<string, unknown> = {}) => {
  const res = await req('POST', token, '/employees', employeePayload(overrides));
  if (res.statusCode !== 201) throw new Error(`create failed: ${res.statusCode} ${res.body}`);
  return res.json<CreateEmployeeResponse>();
};
/** A signed-in user with `role`, linked to `employeeId` (no forced credential change). */
const sessionAs = async (ws: WorkspaceFixture, role: string, employeeId?: string) => {
  const email = `${role.toLowerCase()}-${randomUUID().slice(0, 6)}@x.test`;
  await createUser(t.db, ws, { email, password: 'Passw0rd1', role, employeeId });
  return (await loginAs(t.app, ws.code, email, 'Passw0rd1')).accessToken;
};
const addDays = (iso: string, days: number) => new Date(parseIsoDate(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10);

describe('B1 / FR-AUTH-06: leaving disables the login', () => {
  it('deactivates the user and revokes refresh tokens on RESIGNED; reactivation does not re-enable login', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const { employee, credential } = await createEmployee(token, { employeeCode: 'Q1', login: { method: 'PIN' } });
    const pinLogin = () =>
      t.app.inject({ method: 'POST', url: api('/auth/login/pin'), payload: { workspaceCode: ws.code, identifier: 'Q1', pin: credential!.temporarySecret } });
    const login = await pinLogin();
    expect(login.statusCode).toBe(200);
    const refreshToken = login.json<LoginResponse>().refreshToken;

    expect((await req('PATCH', token, `/employees/${employee.id}`, { status: 'RESIGNED' })).statusCode).toBe(200);

    const user = await t.db.tenant(ws.workspaceId, (tx) => tx.user.findUniqueOrThrow({ where: { employeeId: employee.id }, include: { refreshTokens: true } }));
    expect(user.isActive).toBe(false);
    expect(user.refreshTokens.length).toBeGreaterThan(0);
    expect(user.refreshTokens.every((r) => r.revokedAt)).toBe(true);
    const audit = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { action: 'user.deactivated', entityId: user.id } }));
    expect(audit).toHaveLength(1);

    expect((await pinLogin()).json().error.code).toBe('account_disabled');
    const refresh = await t.app.inject({ method: 'POST', url: api('/auth/refresh'), payload: { refreshToken } });
    expect(refresh.statusCode).toBe(401);

    // HR cannot issue credentials to someone who has left…
    const blocked = await req('POST', token, `/employees/${employee.id}/credentials`, { method: 'PIN' });
    expect(blocked.json().error.code).toBe('employee_inactive');
    // …and bringing them back does not silently re-open the old login.
    expect((await req('PATCH', token, `/employees/${employee.id}`, { status: 'ACTIVE' })).statusCode).toBe(200);
    expect((await pinLogin()).json().error.code).toBe('account_disabled');
    // HR re-issues credentials → active again.
    const reissued = await req('POST', token, `/employees/${employee.id}/credentials`, { method: 'PIN' });
    expect(reissued.statusCode).toBe(200);
    const again = await t.app.inject({
      method: 'POST', url: api('/auth/login/pin'), payload: { workspaceCode: ws.code, identifier: 'Q1', pin: reissued.json().temporarySecret },
    });
    expect(again.statusCode).toBe(200);
  });
});

describe('B2: PATCH can clear optional fields', () => {
  it('null / "" clears values, omitted keys stay unchanged, encrypted fields drop ciphertext and hash', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const boss = (await createEmployee(token)).employee;
    const { employee } = await createEmployee(token, {
      managerId: boss.id, email: 'clear@x.test', phone: '020 5555 7777', nickname: 'Noy', dateOfBirth: '1990-05-01',
      socialSecurityNo: 'SS1234567', idCardNo: 'ID-777-888',
    });
    const res = await req('PATCH', token, `/employees/${employee.id}`, {
      managerId: null, email: null, socialSecurityNo: null, idCardNo: '', nickname: '', dateOfBirth: null,
    });
    expect(res.statusCode).toBe(200);
    const d = res.json<EmployeeDetail>();
    expect(d).toMatchObject({ manager: null, email: null, socialSecurityNo: null, idCardNo: null, nickname: null, dateOfBirth: null });
    expect(d.phone).toBe('02055557777');
    const raw = await t.db.tenant(ws.workspaceId, (tx) => tx.employee.findUniqueOrThrow({ where: { id: employee.id } }));
    expect(raw).toMatchObject({ socialSecurityNoEnc: null, socialSecurityNoHash: null, idCardNoEnc: null, idCardNoHash: null, managerId: null });
  });

  it('rejects clearing the country of a foreign worker', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const { employee } = await createEmployee(token, { nationalityType: 'FOREIGN', nationality: 'Thailand' });
    const res = await req('PATCH', token, `/employees/${employee.id}`, { nationality: null });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('nationality_required');
  });
});

describe('B3 / FR-AUTH-01: password credentials without email', () => {
  it('issues a password to an employee without email; they sign in by employee code and by phone', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const { employee } = await createEmployee(token, { employeeCode: 'NOMAIL1', phone: '020 5555 3131' });
    const issued = await req('POST', token, `/employees/${employee.id}/credentials`, { method: 'PASSWORD' });
    expect(issued.statusCode).toBe(200);
    const password = issued.json().temporarySecret as string;
    const login = (identifier: string) =>
      t.app.inject({ method: 'POST', url: api('/auth/login'), payload: { workspaceCode: ws.code, identifier, password } });
    expect((await login('NOMAIL1')).statusCode).toBe(200);
    expect((await login('020 5555 3131')).statusCode).toBe(200);
  });

  it('accepts login.method PASSWORD on create without email', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const res = await req('POST', token, '/employees', employeePayload({ login: { method: 'PASSWORD' } }));
    expect(res.statusCode).toBe(201);
    expect(res.json<CreateEmployeeResponse>().credential?.method).toBe('PASSWORD');
  });
});

describe('B7: seat limit', () => {
  it('applies to reactivating a resigned employee', async () => {
    const ws = await createWorkspace(t.db, 2);
    const token = await ownerSession(ws);
    const a = (await createEmployee(token)).employee;
    await createEmployee(token);
    expect((await req('PATCH', token, `/employees/${a.id}`, { status: 'RESIGNED' })).statusCode).toBe(200);
    await createEmployee(token); // takes the freed seat
    const back = await req('PATCH', token, `/employees/${a.id}`, { status: 'ACTIVE' });
    expect(back.statusCode).toBe(402);
    expect(back.json().error.code).toBe('seat_limit_reached');
    // Moving between inactive statuses needs no seat.
    expect((await req('PATCH', token, `/employees/${a.id}`, { status: 'TERMINATED' })).statusCode).toBe(200);
  });

  it('lets exactly the allowed number of parallel creates through', async () => {
    const ws = await createWorkspace(t.db, 3);
    const token = await ownerSession(ws);
    const results = await Promise.all(Array.from({ length: 6 }, () => req('POST', token, '/employees', employeePayload())));
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 201, 201, 402, 402, 402]);
    const active = await t.db.tenant(ws.workspaceId, (tx) => tx.employee.count({ where: { workspaceId: ws.workspaceId } }));
    expect(active).toBe(3);
  });
});

describe('B8: data scope', () => {
  const setup = async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const boss = (await createEmployee(token, { employeeCode: 'BOSS' })).employee;
    const mid = (await createEmployee(token, { employeeCode: 'MID', managerId: boss.id })).employee;
    const leaf = (await createEmployee(token, { employeeCode: 'LEAF', managerId: mid.id })).employee;
    const other = (await createEmployee(token, { employeeCode: 'OTHER' })).employee;
    return { ws, token, boss, mid, leaf, other };
  };

  it('limits a manager to themselves and direct + indirect reports; out-of-scope ids are 404', async () => {
    const { ws, mid, leaf, boss, other } = await setup();
    const mgr = await sessionAs(ws, 'MANAGER', mid.id);
    const list = (await req('GET', mgr, '/employees')).json<Paginated<EmployeeSummary>>();
    expect(list.items.map((e) => e.employeeCode).sort()).toEqual(['LEAF', 'MID']);
    expect(list.total).toBe(2);
    expect((await req('GET', mgr, `/employees/${leaf.id}`)).statusCode).toBe(200);
    expect((await req('GET', mgr, `/employees/${boss.id}`)).statusCode).toBe(404);
    expect((await req('GET', mgr, `/employees/${other.id}`)).statusCode).toBe(404);
    expect((await req('GET', mgr, `/employees/${other.id}/history`)).statusCode).toBe(404);
    expect((await req('GET', mgr, `/employees/${leaf.id}/history`)).statusCode).toBe(200);
  });

  it('gives HR (employee.read_all) the whole workspace and a manager without an employee record nothing', async () => {
    const { ws, other } = await setup();
    const hr = await sessionAs(ws, 'HR_ADMIN');
    expect((await req('GET', hr, '/employees')).json().total).toBe(4);
    expect((await req('GET', hr, `/employees/${other.id}`)).statusCode).toBe(200);
    const orphan = await sessionAs(ws, 'MANAGER');
    expect((await req('GET', orphan, '/employees')).json().total).toBe(0);
  });

  it('still rejects manager cycles via the recursive chain check', async () => {
    const { token, boss, leaf } = await setup();
    const res = await req('PATCH', token, `/employees/${boss.id}`, { managerId: leaf.id });
    expect(res.json().error.code).toBe('manager_cycle');
  });
});

describe('B10: national ID / SSN blind index', () => {
  it('returns 409 for duplicates within a workspace (normalised) and allows them across workspaces', async () => {
    const wsA = await createWorkspace(t.db);
    const wsB = await createWorkspace(t.db);
    const a = await ownerSession(wsA);
    const b = await ownerSession(wsB);
    const first = await createEmployee(a, { idCardNo: '01-234 567', socialSecurityNo: 'SS-555666' });

    const dupId = await req('POST', a, '/employees', employeePayload({ idCardNo: '01234567' }));
    expect(dupId.statusCode).toBe(409);
    expect(dupId.json().error.code).toBe('duplicate_national_id');
    const dupSsn = await req('POST', a, '/employees', employeePayload({ socialSecurityNo: 'ss555666' }));
    expect(dupSsn.json().error.code).toBe('duplicate_social_security_no');

    const second = await createEmployee(a);
    const patchDup = await req('PATCH', a, `/employees/${second.employee.id}`, { idCardNo: '01 234 567' });
    expect(patchDup.statusCode).toBe(409);
    expect(patchDup.json().error.code).toBe('duplicate_national_id');

    expect((await req('POST', b, '/employees', employeePayload({ idCardNo: '01234567', socialSecurityNo: 'SS-555666' }))).statusCode).toBe(201);
    const raw = await t.db.tenant(wsA.workspaceId, (tx) => tx.employee.findUniqueOrThrow({ where: { id: first.employee.id } }));
    expect(raw.idCardNoHash).toMatch(/^[0-9a-f]{64}$/);
    expect(raw.idCardNoHash).not.toContain('01234567');
  });

  it('reads legacy plaintext idCardNo until it is backfilled', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const { employee } = await createEmployee(token);
    await t.db.tenant(ws.workspaceId, (tx) => tx.employee.update({ where: { id: employee.id }, data: { idCardNo: 'LEGACY-1234' } }));
    expect((await req('GET', token, `/employees/${employee.id}`)).json<EmployeeDetail>().idCardNo).toBe('LEGACY-1234');
  });
});

describe('B10: backfill-pii script', () => {
  it('encrypts legacy IDs, fills hashes, is idempotent and reports duplicates instead of failing', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const [a, b, c] = await Promise.all([createEmployee(token), createEmployee(token), createEmployee(token, { socialSecurityNo: 'SS8080808' })]);
    await t.db.tenant(ws.workspaceId, async (tx) => {
      await tx.employee.update({ where: { id: a.employee.id }, data: { idCardNo: 'LG-100' } });
      await tx.employee.update({ where: { id: b.employee.id }, data: { idCardNo: 'lg 100' } }); // same after normalising
      await tx.employee.update({ where: { id: c.employee.id }, data: { idCardNo: 'LG-200', socialSecurityNoHash: null } });
    });
    const cipher = createFieldCipher(t.app.config.ENCRYPTION_KEY);
    const mine = (r: Awaited<ReturnType<typeof backfillPii>>) => r.duplicates.filter((d) => d.workspaceId === ws.workspaceId);

    const first = await backfillPii(t.db, cipher);
    expect(mine(first)).toEqual([{ workspaceId: ws.workspaceId, employeeId: expect.any(String), field: 'idCardNo' }]);
    const rows = await t.db.tenant(ws.workspaceId, (tx) => tx.employee.findMany({ where: { workspaceId: ws.workspaceId } }));
    expect(rows.every((r) => r.idCardNo === null && r.idCardNoEnc?.startsWith('v1:'))).toBe(true);
    expect(rows.filter((r) => r.idCardNoHash)).toHaveLength(2);
    expect(rows.find((r) => r.id === c.employee.id)?.socialSecurityNoHash).toBe(cipher.blindIndex('social_security_no', 'SS8080808'));
    expect((await req('GET', token, `/employees/${a.employee.id}`)).json<EmployeeDetail>().idCardNo).toBe('LG-100');

    const second = await backfillPii(t.db, cipher);
    expect(mine(second)).toHaveLength(1); // still reported, nothing re-encrypted
    const again = await t.db.tenant(ws.workspaceId, (tx) => tx.employee.findMany({ where: { workspaceId: ws.workspaceId } }));
    expect(again.map((r) => r.idCardNoEnc).sort()).toEqual(rows.map((r) => r.idCardNoEnc).sort());
  });
});

describe('B11 / FR-EMP-08: employment history', () => {
  it('records effective dates in the workspace timezone (or as supplied) and lists newest first', async () => {
    const ws = await createWorkspace(t.db);
    const tz = 'Pacific/Kiritimati'; // UTC+14: its "today" is usually not the UTC date
    await t.db.system((tx) => tx.workspace.update({ where: { id: ws.workspaceId }, data: { timezone: tz } }));
    const token = await ownerSession(ws);
    const dept = (await req('POST', token, '/departments', { name: 'Ops' })).json<{ id: string }>();
    const { employee } = await createEmployee(token, { hireDate: '2024-01-15' });
    expect((await req('PATCH', token, `/employees/${employee.id}`, { status: 'ACTIVE', effectiveDate: '2025-02-01' })).statusCode).toBe(200);
    expect((await req('PATCH', token, `/employees/${employee.id}`, { departmentId: dept.id })).statusCode).toBe(200);

    const res = await req('GET', token, `/employees/${employee.id}/history`);
    expect(res.statusCode).toBe(200);
    const page = res.json<Paginated<EmploymentHistoryEntry>>();
    expect(page.total).toBe(3);
    expect(page.items.map((h) => h.effectiveDate)).toEqual([todayInTimeZone(tz), '2025-02-01', '2024-01-15']);
    expect(page.items[0]).toMatchObject({ changeType: 'UPDATED', toValue: { departmentId: dept.id }, createdBy: { name: 'Owner' } });
    expect(page.items[1]).toMatchObject({ fromValue: { status: 'PROBATION' }, toValue: { status: 'ACTIVE' } });

    const paged = (await req('GET', token, `/employees/${employee.id}/history?page=2&pageSize=2`)).json<Paginated<EmploymentHistoryEntry>>();
    expect(paged.items.map((h) => h.changeType)).toEqual(['HIRED']);
  });

  it('is permission-checked and tenant-scoped', async () => {
    const wsA = await createWorkspace(t.db);
    const wsB = await createWorkspace(t.db);
    const { employee } = await createEmployee(await ownerSession(wsA));
    expect((await req('GET', await ownerSession(wsB), `/employees/${employee.id}/history`)).statusCode).toBe(404);
    const emp = await sessionAs(wsA, 'EMPLOYEE', employee.id);
    expect((await req('GET', emp, `/employees/${employee.id}/history`)).statusCode).toBe(403);
  });
});

describe('FR-EMP-05.4: document expiry status from the API', () => {
  const docs = async (token: string, employeeId: string, today: string) => {
    for (const offset of [-1, 5, 45, 200]) {
      await req('POST', token, `/employees/${employeeId}/documents`, { type: 'VISA', number: `V${offset}`, expiresAt: addDays(today, offset) });
    }
    await req('POST', token, `/employees/${employeeId}/documents`, { type: 'PASSPORT', number: 'NOEXP' });
    const d = (await req('GET', token, `/employees/${employeeId}`)).json<EmployeeDetail>();
    return Object.fromEntries(d.documents.map((x) => [x.number, { s: x.expiryStatus, days: x.daysUntilExpiry, th: x.expiryThresholdDays }]));
  };

  it('uses the default thresholds (90/60/30/7) in the workspace timezone', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const { employee } = await createEmployee(token, { nationalityType: 'FOREIGN', nationality: 'Vietnam' });
    const byNo = await docs(token, employee.id, todayInTimeZone('Asia/Vientiane'));
    expect(byNo).toEqual({
      'V-1': { s: 'EXPIRED', days: -1, th: null },
      V5: { s: 'EXPIRING', days: 5, th: 7 },
      V45: { s: 'EXPIRING', days: 45, th: 60 },
      V200: { s: 'VALID', days: 200, th: null },
      NOEXP: { s: 'NO_EXPIRY', days: null, th: null },
    });
  });

  it('honours a custom document.expiryAlertDays parameter', async () => {
    const ws = await createWorkspace(t.db);
    await t.db.tenant(ws.workspaceId, (tx) =>
      tx.workspaceParameter.create({
        data: { workspaceId: ws.workspaceId, key: 'document.expiryAlertDays', value: [14], effectiveFrom: parseIsoDate('2020-01-01') },
      }),
    );
    const token = await ownerSession(ws);
    const { employee } = await createEmployee(token);
    const byNo = await docs(token, employee.id, todayInTimeZone('Asia/Vientiane'));
    expect(byNo.V5).toEqual({ s: 'EXPIRING', days: 5, th: 14 });
    expect(byNo.V45).toEqual({ s: 'VALID', days: 45, th: null });
  });
});
