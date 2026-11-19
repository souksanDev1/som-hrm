import type { CreateEmployeeResponse, EmployeeDetail, EmploymentHistoryEntry, EmployeeSummary, Paginated } from '@hrm/shared';
import { randomBytes, randomUUID } from 'node:crypto';
import { createFieldCipher } from '../src/lib/crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, createTestContext, createUser, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const req = (method: 'GET' | 'POST' | 'PATCH', token: string, url: string, payload?: object) =>
  t.app.inject({ method, url: api(url), headers: bearer(token), payload });

/** A workspace with a department, a top-level boss (E001), a supervisor (E002) and a staff member (E003) under E002. */
const setup = async () => {
  const ws = await createWorkspace(t.db);
  const token = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
  const dept = await t.db.tenant(ws.workspaceId, (tx) => tx.department.create({ data: { workspaceId: ws.workspaceId, name: 'Ops' } }));
  const position = await t.db.tenant(ws.workspaceId, (tx) => tx.position.create({ data: { workspaceId: ws.workspaceId, name: 'ຫົວໜ້າໜ້າງານ' } }));
  const make = async (payload: Record<string, unknown>) => {
    const res = await req('POST', token, '/employees', employeePayload(payload));
    expect(res.statusCode, res.body).toBe(201);
    return res.json<CreateEmployeeResponse>().employee;
  };
  const e1 = await make({ employeeCode: 'E001', departmentId: dept.id, isTopLevel: true });
  const e2 = await make({ employeeCode: 'E002', firstName: 'ບົວພັນ', lastName: 'ສີສຸວັນ', departmentId: dept.id, managerId: e1.id, positionId: position.id });
  const e3 = await make({ employeeCode: 'E003', departmentId: dept.id, managerId: e2.id });
  return { ws, token, dept, position, e1, e2, e3, make };
};
const legacy = (ws: WorkspaceFixture, status: 'ACTIVE' | 'RESIGNED', code: string) =>
  t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: { workspaceId: ws.workspaceId, employeeCode: code, firstName: 'Old', lastName: 'Row', gender: 'MALE', contractType: 'INDEFINITE', payType: 'MONTHLY', hireDate: new Date('2020-01-01'), status },
    }),
  );

describe('department + line manager assignment', () => {
  it('POST without a department -> 400 department_required', async () => {
    const { token } = await setup();
    const res = await req('POST', token, '/employees', employeePayload({ departmentId: undefined, isTopLevel: true }));
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain('department_required'); // rejected by the request schema
  });

  it('POST with a department but no manager and not top level -> 400 manager_required', async () => {
    const { token, dept } = await setup();
    const res = await req('POST', token, '/employees', employeePayload({ departmentId: dept.id, isTopLevel: false }));
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain('manager_required'); // rejected by the request schema
  });

  it('POST with a department and isTopLevel -> 201 with no manager', async () => {
    const { token, dept } = await setup();
    const res = await req('POST', token, '/employees', employeePayload({ departmentId: dept.id, isTopLevel: true }));
    expect(res.statusCode).toBe(201);
    expect(res.json<CreateEmployeeResponse>().employee).toMatchObject({ isTopLevel: true, manager: null });
  });

  it('the service enforces the rule for callers that bypass the schema', async () => {
    const { ws, dept } = await setup();
    const { createEmployeesService } = await import('../src/modules/employees/employees.service');
    const service = createEmployeesService(t.db, createFieldCipher(randomBytes(32).toString('base64')));
    const ctx = { workspaceId: ws.workspaceId, userId: null, permissions: [] } as never;
    const input = { ...employeePayload({ departmentId: dept.id }), isTopLevel: false, status: 'ACTIVE' } as never;
    await expect(service.create(ctx, input)).rejects.toMatchObject({ code: 'manager_required' });
  });

  it('PATCH isTopLevel on an employee with a manager clears the manager and records both in history', async () => {
    const { token, e3 } = await setup();
    const res = await req('PATCH', token, `/employees/${e3.id}`, { isTopLevel: true });
    expect(res.statusCode).toBe(200);
    expect(res.json<EmployeeDetail>()).toMatchObject({ isTopLevel: true, manager: null });
    const h = (await req('GET', token, `/employees/${e3.id}/history`)).json<Paginated<EmploymentHistoryEntry>>();
    const entry = h.items.find((x) => x.changeType === 'UPDATED')!;
    expect(entry.fromValue).toMatchObject({ managerId: expect.any(String), isTopLevel: false });
    expect(entry.toValue).toMatchObject({ managerId: null, isTopLevel: true });
  });

  it('PATCH managerId on a top-level employee turns top level off', async () => {
    const { token, e2, make } = await setup();
    const top = await make({ employeeCode: 'TOP2', isTopLevel: true });
    const res = await req('PATCH', token, `/employees/${top.id}`, { managerId: e2.id });
    expect(res.statusCode).toBe(200);
    expect(res.json<EmployeeDetail>()).toMatchObject({ isTopLevel: false, manager: { id: e2.id } });
  });

  it('PATCH isTopLevel together with managerId -> 400 manager_conflicts_top_level', async () => {
    const { token, e3, e2 } = await setup();
    const res = await req('PATCH', token, `/employees/${e3.id}`, { isTopLevel: true, managerId: e2.id });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain('manager_conflicts_top_level'); // rejected by the request schema
  });

  it('PATCH managerId null on an employee that is not top level -> 400 manager_required', async () => {
    const { token, e3 } = await setup();
    const res = await req('PATCH', token, `/employees/${e3.id}`, { managerId: null });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'manager_required' });
  });

  it('a legacy row without department / manager can still be resigned', async () => {
    const { ws, token } = await setup();
    const row = await legacy(ws, 'ACTIVE', 'LEG1');
    const res = await req('PATCH', token, `/employees/${row.id}`, { status: 'RESIGNED' });
    expect(res.statusCode, res.body).toBe(200);
  });

  it('detail and /me/profile expose the manager with the position name', async () => {
    const { ws, token, e2, e3, position } = await setup();
    const expected = { id: e2.id, name: 'ບົວພັນ ສີສຸວັນ', positionName: position.name };
    expect((await req('GET', token, `/employees/${e3.id}`)).json<EmployeeDetail>().manager).toEqual(expected);
    const email = `e3-${randomUUID().slice(0, 6)}@x.test`;
    await createUser(t.db, ws, { email, password: 'Passw0rd1', role: 'EMPLOYEE', employeeId: e3.id });
    const own = (await loginAs(t.app, ws.code, email, 'Passw0rd1')).accessToken;
    expect((await req('GET', own, '/me/profile')).json<EmployeeDetail>().manager).toEqual(expected);
  });

  it('the list flags incomplete active rows only', async () => {
    const { ws, token, e3 } = await setup();
    const active = await legacy(ws, 'ACTIVE', 'LEG-A');
    const gone = await legacy(ws, 'RESIGNED', 'LEG-R');
    const list = (await req('GET', token, '/employees?pageSize=100')).json<Paginated<EmployeeSummary>>();
    const flag = (id: string) => list.items.find((x) => x.id === id)!.assignmentIncomplete;
    expect(flag(active.id)).toBe(true);
    expect(flag(e3.id)).toBe(false);
    expect(flag(gone.id)).toBe(false);
  });
});
