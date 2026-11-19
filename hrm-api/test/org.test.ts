import type { CreateEmployeeResponse, OrgChartNode, OrgStructureNode } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, createTestContext, createUser, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD, type TestContext } from './helpers';

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

  it('renames and deletes a branch; managers cannot change org settings', async () => {
    const ws = await createWorkspace(t.db);
    const token = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
    const req = (tk: string, method: 'POST' | 'PATCH' | 'DELETE' | 'GET', url: string, payload?: object) =>
      t.app.inject({ method, url: api(url), headers: bearer(tk), payload });
    const branch = (await req(token, 'POST', '/branches', { name: 'Old' })).json<{ id: string }>();
    const renamed = await req(token, 'PATCH', `/branches/${branch.id}`, { name: 'New' });
    expect(renamed.json()).toMatchObject({ name: 'New' });

    await createUser(t.db, ws, { email: 'm@x.test', password: 'Manager123', role: 'MANAGER' });
    const mgr = (await loginAs(t.app, ws.code, 'm@x.test', 'Manager123')).accessToken;
    expect((await req(mgr, 'PATCH', `/branches/${branch.id}`, { name: 'Hack' })).statusCode).toBe(403);
    expect((await req(mgr, 'DELETE', `/branches/${branch.id}`)).statusCode).toBe(403);

    expect((await req(token, 'DELETE', `/branches/${branch.id}`)).statusCode).toBe(204);
    expect((await req(token, 'GET', '/branches')).json()).toEqual([]);
  });
});

describe('org structure', () => {
  const findNode = (roots: OrgStructureNode[], pred: (n: OrgStructureNode) => boolean): OrgStructureNode | undefined => {
    for (const r of roots) {
      if (pred(r)) return r;
      const hit = findNode(r.children, pred);
      if (hit) return hit;
    }
    return undefined;
  };
  const setup = async () => {
    const ws = await createWorkspace(t.db);
    const token = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
    const req = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
      t.app.inject({ method, url: api(url), headers: bearer(token), payload });
    const structure = async () => (await req('GET', '/org/structure')).json<OrgStructureNode[]>();
    return { ws, token, req, structure };
  };

  it('serves the department structure', async () => {
    const { req, structure } = await setup();
    const chairman = (await req('POST', '/departments', { name: 'Chairman' })).json<{ id: string }>();
    const ceo = (await req('POST', '/departments', { name: 'CEO', parentId: chairman.id })).json<{ id: string }>();
    const ops = (await req('POST', '/departments', { name: 'Ops', parentId: ceo.id })).json<{ id: string }>();
    const e1 = (await req('POST', '/employees', employeePayload({ employeeCode: 'E1', departmentId: ops.id }))).json<CreateEmployeeResponse>().employee;
    await req('POST', '/employees', employeePayload({ employeeCode: 'E2', departmentId: ops.id }));
    expect((await req('PATCH', `/departments/${ops.id}`, { headEmployeeId: e1.id })).statusCode).toBe(200);

    const roots = await structure();
    expect(roots[0]!.name).toBe('Chairman');
    const node = findNode(roots, (n) => n.id === ops.id)!;
    expect(node.head?.employeeCode).toBe('E1');
    expect(node.members.map((m) => m.employeeCode)).toEqual(['E2']);
    expect(node.employeeCount).toBe(2);
  });

  it('excludes closed departments and inactive staff', async () => {
    const { ws, req, structure } = await setup();
    const leaf = (await req('POST', '/departments', { name: 'Leaf' })).json<{ id: string }>();
    await req('POST', '/employees', employeePayload({ employeeCode: 'IN', departmentId: leaf.id }));
    const gone = (await req('POST', '/employees', employeePayload({ employeeCode: 'GONE', departmentId: leaf.id }))).json<CreateEmployeeResponse>().employee;
    await t.db.tenant(ws.workspaceId, (tx) => tx.employee.update({ where: { id: gone.id }, data: { status: 'TERMINATED' } }));
    expect((await req('POST', `/departments/${leaf.id}/close`)).statusCode).toBe(200);

    const roots = await structure();
    expect(findNode(roots, (n) => n.id === leaf.id)).toBeUndefined();
    const unassigned = roots.find((n) => n.id === 'unassigned')!;
    expect(unassigned.kind).toBe('unassigned');
    expect(unassigned.members.map((m) => m.employeeCode)).toContain('IN');
    const everyone = JSON.stringify(roots);
    expect(everyone).not.toContain('"GONE"');
  });

  it('clears a department head with null', async () => {
    const { req } = await setup();
    const d = (await req('POST', '/departments', { name: 'D' })).json<{ id: string }>();
    const e = (await req('POST', '/employees', employeePayload({ departmentId: d.id }))).json<CreateEmployeeResponse>().employee;
    await req('PATCH', `/departments/${d.id}`, { headEmployeeId: e.id });
    const res = await req('PATCH', `/departments/${d.id}`, { headEmployeeId: null });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ headEmployeeId: string | null }>().headEmployeeId).toBeNull();
  });

  it('rejects a department head who is no longer employed', async () => {
    const { ws, req } = await setup();
    const d = (await req('POST', '/departments', { name: 'D' })).json<{ id: string }>();
    const e = (await req('POST', '/employees', employeePayload({ departmentId: d.id }))).json<CreateEmployeeResponse>().employee;
    await t.db.tenant(ws.workspaceId, (tx) => tx.employee.update({ where: { id: e.id }, data: { status: 'RESIGNED' } }));
    const res = await req('PATCH', `/departments/${d.id}`, { headEmployeeId: e.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_reference');
  });

  it('employee role can read the structure', async () => {
    const { ws } = await setup();
    await createUser(t.db, ws, { email: 'emp@x.test', password: 'Employee123', role: 'EMPLOYEE' });
    const token = (await loginAs(t.app, ws.code, 'emp@x.test', 'Employee123')).accessToken;
    expect((await t.app.inject({ method: 'GET', url: api('/org/structure'), headers: bearer(token) })).statusCode).toBe(200);
  });
});
