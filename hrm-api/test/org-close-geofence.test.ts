import type { Branch, Department, Position } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, createTestContext, createUser, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
const session = async (ws: WorkspaceFixture) => {
  const token = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
  return (method: Method, url: string, payload?: object) => t.app.inject({ method, url: api(url), headers: bearer(token), payload });
};
const auditOf = (ws: WorkspaceFixture, entityId: string) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } }));

describe('branch geofence (FR-WS-02.4)', () => {
  it('stores a geofence and validates coordinate and radius ranges', async () => {
    const req = await session(await createWorkspace(t.db));
    const ok = await req('POST', '/branches', { name: 'HQ', address: 'Vientiane', latitude: 17.9757, longitude: 102.6331, geofenceRadius: 200 });
    expect(ok.statusCode).toBe(201);
    expect(ok.json<Branch>()).toMatchObject({ latitude: 17.9757, longitude: 102.6331, geofenceRadius: 200, isActive: true });

    for (const bad of [
      { name: 'B1', latitude: 91, longitude: 100 },
      { name: 'B2', latitude: 17, longitude: -181 },
      { name: 'B3', geofenceRadius: 19 },
      { name: 'B4', geofenceRadius: 5001 },
      { name: 'B5', geofenceRadius: 150.5 },
      { name: 'B6', latitude: 17.9 },
    ]) {
      const res = await req('POST', '/branches', bad);
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
    }
  });

  it('keeps the stored geofence complete on partial updates and allows clearing it', async () => {
    const ws = await createWorkspace(t.db);
    const req = await session(ws);
    const b = (await req('POST', '/branches', { name: 'Site' })).json<Branch>();
    expect(b).toMatchObject({ latitude: null, longitude: null, geofenceRadius: 150 });

    const half = await req('PATCH', `/branches/${b.id}`, { latitude: 18 });
    expect(half.statusCode).toBe(400);
    expect(half.json().error.code).toBe('geofence_incomplete');

    const set = await req('PATCH', `/branches/${b.id}`, { latitude: 18, longitude: 102.5, geofenceRadius: 300 });
    expect(set.json<Branch>()).toMatchObject({ latitude: 18, longitude: 102.5, geofenceRadius: 300 });
    // Moving one coordinate of a complete geofence is fine.
    expect((await req('PATCH', `/branches/${b.id}`, { longitude: 102.6 })).json<Branch>().longitude).toBe(102.6);
    expect((await req('PATCH', `/branches/${b.id}`, { longitude: null })).statusCode).toBe(400);
    const cleared = await req('PATCH', `/branches/${b.id}`, { latitude: null, longitude: null });
    expect(cleared.json<Branch>()).toMatchObject({ latitude: null, longitude: null });

    const updates = (await auditOf(ws, b.id)).filter((a) => a.action === 'branch.updated');
    expect(updates).toHaveLength(3);
    expect(updates[0]!.meta).toEqual({
      changes: { latitude: { from: null, to: 18 }, longitude: { from: null, to: 102.5 }, geofenceRadius: { from: 150, to: 300 } },
    });
  });
});

describe('close / reopen org items (FR-WS-02.1–02.3)', () => {
  it('closes a branch in use instead of deleting it, hides it from pickers and keeps it for history', async () => {
    const ws = await createWorkspace(t.db);
    const req = await session(ws);
    const branch = (await req('POST', '/branches', { name: 'Pakse' })).json<Branch>();
    const emp = (await req('POST', '/employees', employeePayload({ branchId: branch.id }))).json<{ employee: { id: string } }>().employee;

    expect((await req('DELETE', `/branches/${branch.id}`)).json().error.code).toBe('in_use');
    const closed = await req('POST', `/branches/${branch.id}/close`);
    expect(closed.statusCode).toBe(200);
    expect(closed.json<Branch>()).toMatchObject({ isActive: false, employeeCount: 1 });

    expect((await req('GET', '/branches')).json<Branch[]>()).toEqual([]);
    const all = (await req('GET', '/branches?includeClosed=true')).json<Branch[]>();
    expect(all.map((b) => [b.name, b.isActive])).toEqual([['Pakse', false]]);
    // The employee keeps the closed branch (history).
    const detail = (await req('GET', `/employees/${emp.id}`)).json<{ branch: { id: string } | null }>();
    expect(detail.branch?.id).toBe(branch.id);

    // Closing twice is a no-op; reopening brings it back to the pickers.
    expect((await req('POST', `/branches/${branch.id}/close`)).statusCode).toBe(200);
    expect((await req('POST', `/branches/${branch.id}/reopen`)).json<Branch>().isActive).toBe(true);
    expect((await req('GET', '/branches')).json<Branch[]>()).toHaveLength(1);

    const actions = (await auditOf(ws, branch.id)).map((a) => a.action);
    expect(actions).toEqual(['branch.created', 'branch.closed', 'branch.reopened']);
  });

  it('closes and reopens departments and positions, with edit of name and level', async () => {
    const ws = await createWorkspace(t.db);
    const req = await session(ws);
    const parent = (await req('POST', '/departments', { name: 'Ops' })).json<Department>();
    const child = (await req('POST', '/departments', { name: 'Ops-North', parentId: parent.id })).json<Department>();

    const blocked = await req('POST', `/departments/${parent.id}/close`);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('has_open_children');
    expect((await req('POST', `/departments/${child.id}/close`)).json<Department>().isActive).toBe(false);
    expect((await req('POST', `/departments/${parent.id}/close`)).json<Department>().isActive).toBe(false);
    expect((await req('GET', '/departments')).json<Department[]>()).toEqual([]);
    expect((await req('GET', '/departments?includeClosed=true')).json<Department[]>()).toHaveLength(2);

    // A closed department cannot become a new parent.
    const other = (await req('POST', '/departments', { name: 'Sales' })).json<Department>();
    const badParent = await req('PATCH', `/departments/${other.id}`, { parentId: parent.id });
    expect(badParent.statusCode).toBe(400);
    expect(badParent.json().error.code).toBe('invalid_reference');
    // Re-sending the unchanged (closed) parent is fine.
    const resend = await req('PATCH', `/departments/${child.id}`, { parentId: parent.id, name: 'Ops-N' });
    expect(resend.statusCode).toBe(200);
    expect(resend.json<Department>()).toMatchObject({ parentId: parent.id, name: 'Ops-N' });
    expect((await req('POST', `/departments/${parent.id}/reopen`)).json<Department>().isActive).toBe(true);
    expect((await req('PATCH', `/departments/${other.id}`, { parentId: parent.id, name: 'Sales & Ops' })).json<Department>()).toMatchObject({
      parentId: parent.id,
      name: 'Sales & Ops',
    });

    const pos = (await req('POST', '/positions', { name: 'Clerk', level: 1 })).json<Position>();
    expect((await req('PATCH', `/positions/${pos.id}`, { name: 'Senior clerk', level: 3 })).json<Position>()).toMatchObject({ name: 'Senior clerk', level: 3 });
    expect((await req('POST', `/positions/${pos.id}/close`)).json<Position>().isActive).toBe(false);
    expect((await req('GET', '/positions')).json<Position[]>()).toEqual([]);
    expect((await req('GET', '/positions?includeClosed=true')).json<Position[]>().map((p) => p.name)).toEqual(['Senior clerk']);
    const posAudit = (await auditOf(ws, pos.id)).map((a) => [a.action, a.meta]);
    expect(posAudit).toEqual([
      ['position.created', { name: 'Clerk', level: 1 }],
      ['position.updated', { changes: { name: { from: 'Clerk', to: 'Senior clerk' }, level: { from: 1, to: 3 } } }],
      ['position.closed', { name: 'Senior clerk' }],
    ]);
    expect((await req('POST', '/positions/missing/close')).statusCode).toBe(404);
  });

  it('requires org.write to close or reopen', async () => {
    const ws = await createWorkspace(t.db);
    const req = await session(ws);
    const b = (await req('POST', '/branches', { name: 'X' })).json<Branch>();
    await createUser(t.db, ws, { email: 'mgr@x.test', password: 'Manager123', role: 'MANAGER' });
    const mgr = (await loginAs(t.app, ws.code, 'mgr@x.test', 'Manager123')).accessToken;
    const as = (method: Method, url: string) => t.app.inject({ method, url: api(url), headers: bearer(mgr) });
    expect((await as('POST', `/branches/${b.id}/close`)).statusCode).toBe(403);
    expect((await as('POST', `/branches/${b.id}/reopen`)).statusCode).toBe(403);
    expect((await as('GET', '/branches')).statusCode).toBe(200);
  });

  it('isolates tenants: another workspace cannot see, edit or close its items', async () => {
    const a = await createWorkspace(t.db);
    const b = await createWorkspace(t.db);
    const reqA = await session(a);
    const reqB = await session(b);
    const branchA = (await reqA('POST', '/branches', { name: 'A-only', latitude: 17, longitude: 102 })).json<Branch>();
    const posA = (await reqA('POST', '/positions', { name: 'A-pos' })).json<Position>();

    expect((await reqB('GET', '/branches?includeClosed=true')).json<Branch[]>()).toEqual([]);
    expect((await reqB('PATCH', `/branches/${branchA.id}`, { name: 'stolen' })).statusCode).toBe(404);
    expect((await reqB('POST', `/branches/${branchA.id}/close`)).statusCode).toBe(404);
    expect((await reqB('POST', `/positions/${posA.id}/close`)).statusCode).toBe(404);
    // RLS: even an unfiltered query inside B's scope sees none of A's rows.
    expect(await t.db.tenant(b.workspaceId, (tx) => tx.branch.count({ where: { id: branchA.id } }))).toBe(0);
    expect((await reqA('GET', '/branches')).json<Branch[]>()[0]).toMatchObject({ name: 'A-only', isActive: true });
  });
});
