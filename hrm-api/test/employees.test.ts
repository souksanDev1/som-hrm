import type { CreateEmployeeResponse, EmployeeDetail, LoginResponse } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
const post = (token: string, url: string, payload: object) => t.app.inject({ method: 'POST', url: api(url), headers: bearer(token), payload });
const patch = (token: string, url: string, payload: object) => t.app.inject({ method: 'PATCH', url: api(url), headers: bearer(token), payload });
const get = (token: string, url: string) => t.app.inject({ method: 'GET', url: api(url), headers: bearer(token) });

describe('employees', () => {
  it('creates an employee with a PIN login and returns a one-time PIN usable to sign in', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const res = await post(token, '/employees', employeePayload({ employeeCode: 'P01', phone: '020 5555 2222', login: { method: 'PIN' } }));
    expect(res.statusCode).toBe(201);
    const body = res.json<CreateEmployeeResponse>();
    expect(body.employee.hasLogin).toBe(true);
    expect(body.credential?.temporarySecret).toMatch(/^\d{6}$/);

    const pinLogin = await t.app.inject({
      method: 'POST', url: api('/auth/login/pin'),
      payload: { workspaceCode: ws.code, identifier: 'P01', pin: body.credential!.temporarySecret },
    });
    expect(pinLogin.statusCode).toBe(200);
    expect(pinLogin.json<LoginResponse>().user.mustChangeCredential).toBe(true);
  });

  it('encrypts social-security and family-book numbers at rest and masks them without permission', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const created = (await post(token, '/employees', employeePayload({ socialSecurityNo: 'SS9988776', familyBookNo: 'VT-55555' }))).json<CreateEmployeeResponse>();
    expect(created.employee.socialSecurityNo).toBe('SS9988776');

    const raw = await t.db.tenant(ws.workspaceId, (tx) => tx.employee.findUniqueOrThrow({ where: { id: created.employee.id } }));
    expect(raw.socialSecurityNoEnc).not.toContain('SS9988776');
    expect(raw.familyBookNoEnc).toMatch(/^v1:/);

    await createUser(t.db, ws, { email: 'mgr@x.test', password: 'Manager123', role: 'MANAGER' });
    const mgr = (await loginAs(t.app, ws.code, 'mgr@x.test', 'Manager123')).accessToken;
    const masked = (await get(mgr, `/employees/${created.employee.id}`)).json<EmployeeDetail>();
    expect(masked.sensitiveMasked).toBe(true);
    expect(masked.socialSecurityNo).toBe('•••••8776');
  });

  it('enforces permissions: employees cannot list staff', async () => {
    const ws = await createWorkspace(t.db);
    await createUser(t.db, ws, { email: 'emp@x.test', password: 'Employee123', role: 'EMPLOYEE' });
    const emp = (await loginAs(t.app, ws.code, 'emp@x.test', 'Employee123')).accessToken;
    const res = await get(emp, '/employees');
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('forbidden');
  });

  it('rejects missing nationality for foreign workers and seat overflow', async () => {
    const ws = await createWorkspace(t.db, 1);
    const token = await ownerSession(ws);
    expect((await post(token, '/employees', employeePayload({ employeeCode: 'D1' }))).statusCode).toBe(201);
    const foreign = await post(token, '/employees', employeePayload({ nationalityType: 'FOREIGN' }));
    expect(foreign.statusCode).toBe(400);
    const overflow = await post(token, '/employees', employeePayload());
    expect(overflow.statusCode).toBe(402);
    expect(overflow.json().error.code).toBe('seat_limit_reached');
  });

  it('returns 409 for a duplicate employee code', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    await post(token, '/employees', employeePayload({ employeeCode: 'DUP' }));
    const dup = await post(token, '/employees', employeePayload({ employeeCode: 'DUP' }));
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('employee_code_taken');
  });

  it('prevents manager cycles and records employment history', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const a = (await post(token, '/employees', employeePayload())).json<CreateEmployeeResponse>().employee;
    const b = (await post(token, '/employees', employeePayload({ managerId: a.id }))).json<CreateEmployeeResponse>().employee;
    const cycle = await patch(token, `/employees/${a.id}`, { managerId: b.id });
    expect(cycle.statusCode).toBe(400);
    expect(cycle.json().error.code).toBe('manager_cycle');

    expect((await patch(token, `/employees/${b.id}`, { status: 'ACTIVE' })).statusCode).toBe(200);
    const history = await t.db.tenant(ws.workspaceId, (tx) => tx.employmentHistory.findMany({ where: { employeeId: b.id } }));
    expect(history.map((h) => h.changeType).sort()).toEqual(['HIRED', 'UPDATED']);
  });

  it('rejects references to another workspace (FKs bypass RLS, so the service must check)', async () => {
    const wsA = await createWorkspace(t.db);
    const wsB = await createWorkspace(t.db);
    const tokenB = await ownerSession(wsB);
    const deptB = (await post(tokenB, '/departments', { name: 'B dept' })).json<{ id: string }>();
    const tokenA = await ownerSession(wsA);
    const res = await post(tokenA, '/employees', employeePayload({ departmentId: deptB.id }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_reference');
    expect((await get(tokenA, `/employees?search=x`)).json().total).toBe(0);
  });

  it('adds foreign-worker documents and validates dates', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const e = (await post(token, '/employees', employeePayload({ nationalityType: 'FOREIGN', nationality: 'Thailand' }))).json<CreateEmployeeResponse>().employee;
    const bad = await post(token, `/employees/${e.id}/documents`, { type: 'WORK_PERMIT', issuedAt: '2026-05-01', expiresAt: '2026-01-01' });
    expect(bad.statusCode).toBe(400);
    const ok = await post(token, `/employees/${e.id}/documents`, { type: 'WORK_PERMIT', number: 'WP-1', issuedAt: '2026-01-01', expiresAt: '2027-01-01' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json<EmployeeDetail>().documents).toHaveLength(1);
  });

  it('lets HR reset a PIN, invalidating the old one', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const created = (await post(token, '/employees', employeePayload({ employeeCode: 'R1', login: { method: 'PIN' } }))).json<CreateEmployeeResponse>();
    const reset = await post(token, `/employees/${created.employee.id}/credentials`, { method: 'PIN' });
    expect(reset.statusCode).toBe(200);
    const pin = (body: string) => t.app.inject({ method: 'POST', url: api('/auth/login/pin'), payload: { workspaceCode: ws.code, identifier: 'R1', pin: body } });
    const newPin = reset.json().temporarySecret as string;
    if (newPin !== created.credential!.temporarySecret) {
      expect((await pin(created.credential!.temporarySecret)).statusCode).toBe(401);
    }
    expect((await pin(newPin)).statusCode).toBe(200);
  });

  it('lets any employee read only their own profile, unmasked', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    const created = (await post(token, '/employees', employeePayload({ employeeCode: 'ME1', socialSecurityNo: 'SS4444444', login: { method: 'PIN' } }))).json<CreateEmployeeResponse>();
    const pinRes = await t.app.inject({
      method: 'POST', url: api('/auth/login/pin'),
      payload: { workspaceCode: ws.code, identifier: 'ME1', pin: created.credential!.temporarySecret },
    });
    const empToken = pinRes.json<LoginResponse>().accessToken;
    const me = await get(empToken, '/me/profile');
    expect(me.statusCode).toBe(200);
    expect(me.json<EmployeeDetail>().socialSecurityNo).toBe('SS4444444');
    expect((await get(empToken, `/employees/${created.employee.id}`)).statusCode).toBe(403);
    // The owner account in this fixture has no employee record.
    expect((await get(token, '/me/profile')).json().error.code).toBe('no_employee_profile');
  });

  it('lists with search and pagination', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerSession(ws);
    await post(token, '/employees', employeePayload({ employeeCode: 'S1', firstName: 'Khamla' }));
    await post(token, '/employees', employeePayload({ employeeCode: 'S2', firstName: 'Noy' }));
    const res = (await get(token, '/employees?search=khaml&page=1&pageSize=10')).json();
    expect(res.total).toBe(1);
    expect(res.items[0].employeeCode).toBe('S1');
  });
});
