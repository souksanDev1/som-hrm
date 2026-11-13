import type { CreateEmployeeResponse, OrgChartNode } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, createTestContext, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

describe('organisation', () => {
  it('builds the org chart from manager relations', async () => {
    const ws = await createWorkspace(t.db);
    const token = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
    const post = (url: string, payload: object) => t.app.inject({ method: 'POST', url: api(url), headers: bearer(token), payload });
    const boss = (await post('/employees', employeePayload({ employeeCode: 'B' }))).json<CreateEmployeeResponse>().employee;
    await post('/employees', employeePayload({ employeeCode: 'R1', managerId: boss.id }));
    await post('/employees', employeePayload({ employeeCode: 'R2', managerId: boss.id }));

    const chart = (await t.app.inject({ method: 'GET', url: api('/org/chart'), headers: bearer(token) })).json<OrgChartNode[]>();
    expect(chart).toHaveLength(1);
    expect(chart[0]!.children.map((c) => c.employeeCode)).toEqual(['R1', 'R2']);
  });

  it('refuses to delete a department in use and rejects duplicate names', async () => {
    const ws = await createWorkspace(t.db);
    const token = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
    const req = (method: 'POST' | 'DELETE', url: string, payload?: object) =>
      t.app.inject({ method, url: api(url), headers: bearer(token), payload });
    const dept = (await req('POST', '/departments', { name: 'Ops' })).json<{ id: string }>();
    expect((await req('POST', '/departments', { name: 'Ops' })).statusCode).toBe(409);
    await req('POST', '/employees', employeePayload({ departmentId: dept.id }));
    const del = await req('DELETE', `/departments/${dept.id}`);
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('in_use');
  });

  it('prevents department parent cycles', async () => {
    const ws = await createWorkspace(t.db);
    const token = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
    const req = (method: 'POST' | 'PATCH', url: string, payload: object) =>
      t.app.inject({ method, url: api(url), headers: bearer(token), payload });
    const parent = (await req('POST', '/departments', { name: 'P' })).json<{ id: string }>();
    const child = (await req('POST', '/departments', { name: 'C', parentId: parent.id })).json<{ id: string }>();
    const res = await req('PATCH', `/departments/${parent.id}`, { parentId: child.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('department_cycle');
  });
});
