import { randomUUID } from 'node:crypto';
import type { LoginResponse } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authChangeOf, parseNotifyPayload, toNotifyPayload } from '../src/db/auth-changes';
import { createDb, type Db } from '../src/db/client';
import { AuthCache } from '../src/modules/auth/auth-cache';
import { authRepository } from '../src/modules/auth/auth.repository';
import { TEST_DATABASE_URL } from './env';
import { api, bearer, createTestContext, createUser, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

/**
 * Hardening H1: the authenticate hook serves auth contexts from a cache instead of opening a second transaction
 * per request. Every change that matters (account disabled, role / permission change, credential change,
 * workspace suspended) must still take effect on the very next request.
 */

describe('authChangeOf (which writes invalidate cached auth contexts)', () => {
  it('maps user writes to that user and ignores sign-in bookkeeping and new rows', () => {
    expect(authChangeOf('User', 'update', { where: { id: 'u1' }, data: { isActive: false } })).toEqual({ userIds: ['u1'] });
    expect(authChangeOf('User', 'update', { where: { id: 'u1' }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } })).toBeNull();
    expect(authChangeOf('User', 'updateMany', { where: { workspaceId: 'w' }, data: { isActive: false } })).toEqual({ all: true });
    expect(authChangeOf('User', 'create', { data: {} })).toBeNull();
    expect(authChangeOf('User', 'findUnique', { where: { id: 'u1' } })).toBeNull();
    expect(authChangeOf('UserRole', 'create', { data: { userId: 'u2' } })).toEqual({ userIds: ['u2'] });
    expect(authChangeOf('UserRole', 'deleteMany', { where: { userId: 'u2' } })).toEqual({ userIds: ['u2'] });
    expect(authChangeOf('RolePermission', 'deleteMany', { where: {} })).toEqual({ all: true });
    expect(authChangeOf('Workspace', 'update', { where: { id: 'w' }, data: {} })).toEqual({ all: true });
    expect(authChangeOf('Role', 'create', { data: {} })).toBeNull();
    expect(authChangeOf('Employee', 'update', { where: { id: 'e' }, data: {} })).toBeNull();
  });

  it('round-trips notify payloads and falls back to "everyone"', () => {
    expect(parseNotifyPayload(toNotifyPayload({ userIds: ['a', 'b'] }))).toEqual({ userIds: ['a', 'b'] });
    expect(parseNotifyPayload(toNotifyPayload({ all: true }))).toEqual({ all: true });
    expect(parseNotifyPayload('garbage')).toEqual({ all: true });
    expect(parseNotifyPayload(toNotifyPayload({ userIds: Array.from({ length: 500 }, () => randomUUID()) }))).toEqual({ all: true });
  });
});

describe('AuthCache', () => {
  const ready = (ttlMs = 5_000, now?: () => number) => {
    const cache = new AuthCache<string>({ ttlMs, now });
    cache.setReady(true);
    return cache;
  };

  it('serves hits, expires after the TTL and is bypassed while not ready', async () => {
    let clock = 0;
    const cache = ready(1_000, () => clock);
    const load = vi.fn(async () => 'ctx');
    await cache.get('w', 'u', load);
    await cache.get('w', 'u', load);
    expect(load).toHaveBeenCalledTimes(1);
    clock = 1_000;
    await cache.get('w', 'u', load);
    expect(load).toHaveBeenCalledTimes(2);

    cache.setReady(false);
    await cache.get('w', 'u', load);
    await cache.get('w', 'u', load);
    expect(load).toHaveBeenCalledTimes(4);
    expect(new AuthCache<string>({ ttlMs: 0 }).enabled).toBe(false);
  });

  it('never caches null and drops entries on invalidation', async () => {
    const cache = ready();
    const none = vi.fn(async () => null);
    await cache.get('w', 'u', none);
    await cache.get('w', 'u', none);
    expect(none).toHaveBeenCalledTimes(2);

    const load = vi.fn(async () => 'ctx');
    await cache.get('w', 'u', load);
    cache.invalidate({ userIds: ['other'] });
    await cache.get('w', 'u', load);
    expect(load).toHaveBeenCalledTimes(1);
    cache.invalidate({ userIds: ['u'] });
    await cache.get('w', 'u', load);
    expect(load).toHaveBeenCalledTimes(2);
    cache.invalidate({ all: true });
    await cache.get('w', 'u', load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('does not store a load that overlapped an invalidation (it may have read the old state)', async () => {
    const cache = ready();
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const pending = cache.get('w', 'u', async () => {
      await slow;
      return 'old';
    });
    cache.invalidate({ userIds: ['u'] }); // the change commits while the load is in flight
    release();
    expect(await pending).toBe('old'); // this request saw the old state (it started first)…
    const next = vi.fn(async () => 'new');
    expect(await cache.get('w', 'u', next)).toBe('new'); // …but the next one reloads
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('authenticate hook with the auth cache (PostgreSQL)', () => {
  let t: TestContext;
  beforeAll(async () => {
    // A long TTL proves invalidation, not expiry, is what makes changes visible.
    t = await createTestContext({ AUTH_CACHE_TTL_MS: '60000' });
    await vi.waitFor(() => expect(t.app.authCache.enabled).toBe(true), { timeout: 5_000 });
  });
  afterAll(() => t.close());

  const get = (token: string, url: string) => t.app.inject({ method: 'GET', url: api(url), headers: bearer(token) });
  const session = async (ws: WorkspaceFixture, role: string) => {
    const email = `${role.toLowerCase()}-${randomUUID().slice(0, 6)}@x.test`;
    const user = await createUser(t.db, ws, { email, password: 'Passw0rd1', role });
    const login = await loginAs(t.app, ws.code, email, 'Passw0rd1');
    return { userId: user.id, email, ...login };
  };

  it('resolves the principal once and serves later requests from the cache', async () => {
    const ws = await createWorkspace(t.db);
    const s = await session(ws, 'HR_ADMIN');
    const spy = vi.spyOn(authRepository, 'findPrincipal');
    try {
      for (let i = 0; i < 5; i++) expect((await get(s.accessToken, '/employees')).statusCode).toBe(200);
      expect(spy.mock.calls.filter(([, id]) => id === s.userId)).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('a disabled account (HR marks the employee RESIGNED) is refused on the next request', async () => {
    const ws = await createWorkspace(t.db);
    const owner = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
    const created = await t.app.inject({ method: 'POST', url: api('/employees'), headers: bearer(owner), payload: employeePayload({ employeeCode: 'AC1' }) });
    const employeeId = created.json<{ employee: { id: string } }>().employee.id;
    const email = `ac1-${randomUUID().slice(0, 6)}@x.test`;
    await createUser(t.db, ws, { email, password: 'Passw0rd1', role: 'EMPLOYEE', employeeId });
    const token = (await loginAs(t.app, ws.code, email, 'Passw0rd1')).accessToken;
    expect((await get(token, '/attendance/me/status')).statusCode).toBe(200);
    expect((await get(token, '/attendance/me/status')).statusCode).toBe(200); // cached now

    const patch = await t.app.inject({ method: 'PATCH', url: api(`/employees/${employeeId}`), headers: bearer(owner), payload: { status: 'RESIGNED' } });
    expect(patch.statusCode).toBe(200);
    const res = await get(token, '/attendance/me/status');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('account_disabled');
  });

  it('a role change and a permission removed from a role apply on the next request', async () => {
    const ws = await createWorkspace(t.db);
    const hr = await session(ws, 'HR_ADMIN');
    expect((await get(hr.accessToken, '/employees')).statusCode).toBe(200);
    await t.db.tenant(ws.workspaceId, (tx) => tx.userRole.updateMany({ where: { userId: hr.userId }, data: { roleId: ws.roles.EMPLOYEE! } }));
    expect((await get(hr.accessToken, '/employees')).statusCode).toBe(403);

    const manager = await session(ws, 'MANAGER');
    expect((await get(manager.accessToken, '/employees')).statusCode).toBe(200);
    await t.db.tenant(ws.workspaceId, (tx) =>
      tx.rolePermission.deleteMany({ where: { roleId: ws.roles.MANAGER!, permission: { key: 'employee.read' } } }),
    );
    expect((await get(manager.accessToken, '/employees')).statusCode).toBe(403);
  });

  it('a forced credential change gates the next request, and clears once the password is changed', async () => {
    const ws = await createWorkspace(t.db);
    const s = await session(ws, 'HR_ADMIN');
    expect((await get(s.accessToken, '/employees')).statusCode).toBe(200);
    await t.db.tenant(ws.workspaceId, (tx) => tx.user.update({ where: { id: s.userId }, data: { mustChangeCredential: true } }));
    expect((await get(s.accessToken, '/employees')).json().error.code).toBe('credential_change_required');

    const change = await t.app.inject({
      method: 'POST', url: api('/auth/change-password'), headers: bearer(s.accessToken), payload: { currentPassword: 'Passw0rd1', newPassword: 'Passw0rd2!' },
    });
    expect(change.statusCode).toBeLessThan(300);
    expect((await get(s.accessToken, '/employees')).statusCode).toBe(200);
  });

  it('a suspended workspace is refused on the next request', async () => {
    const ws = await createWorkspace(t.db);
    const s = await session(ws, 'HR_ADMIN');
    expect((await get(s.accessToken, '/employees')).statusCode).toBe(200);
    await t.db.system((tx) => tx.workspace.update({ where: { id: ws.workspaceId }, data: { status: 'SUSPENDED' } }));
    expect((await get(s.accessToken, '/employees')).json().error.code).toBe('workspace_suspended');
  });

  it('logout still revokes the session: the refresh token is refused at once', async () => {
    const ws = await createWorkspace(t.db);
    const s = await session(ws, 'EMPLOYEE');
    expect((await t.app.inject({ method: 'POST', url: api('/auth/logout'), payload: { refreshToken: s.refreshToken } })).statusCode).toBeLessThan(300);
    const refresh = await t.app.inject({ method: 'POST', url: api('/auth/refresh'), payload: { refreshToken: s.refreshToken } });
    expect(refresh.statusCode).toBe(401);
  });

  it('a change committed by another process (e.g. the worker) reaches this API through LISTEN/NOTIFY', async () => {
    const ws = await createWorkspace(t.db);
    const s = await session(ws, 'HR_ADMIN');
    expect((await get(s.accessToken, '/employees')).statusCode).toBe(200);
    expect((await get(s.accessToken, '/employees')).statusCode).toBe(200);

    const worker: Db = createDb(TEST_DATABASE_URL); // separate Prisma client: no in-process callback reaches the API
    try {
      await worker.tenant(ws.workspaceId, (tx) => tx.user.update({ where: { id: s.userId }, data: { isActive: false } }));
    } finally {
      await worker.disconnect();
    }
    await vi.waitFor(async () => expect((await get(s.accessToken, '/employees')).statusCode).toBe(401), { timeout: 2_000, interval: 20 });
  });

  it('a rolled-back change invalidates nothing and is not announced', async () => {
    const ws = await createWorkspace(t.db);
    const s = await session(ws, 'HR_ADMIN');
    const seen: unknown[] = [];
    const off = t.db.onAuthChange((c) => seen.push(c));
    try {
      await expect(
        t.db.tenant(ws.workspaceId, async (tx) => {
          await tx.user.update({ where: { id: s.userId }, data: { isActive: false } });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(seen).toEqual([]);
      expect((await get(s.accessToken, '/employees')).statusCode).toBe(200);
    } finally {
      off();
    }
  });

  it('signing in does not flush the cache (sign-in bookkeeping is ignored)', async () => {
    const ws = await createWorkspace(t.db);
    const s = await session(ws, 'HR_ADMIN');
    const seen: unknown[] = [];
    const off = t.db.onAuthChange((c) => seen.push(c));
    try {
      const again = await t.app.inject({ method: 'POST', url: api('/auth/login'), payload: { workspaceCode: ws.code, identifier: s.email, password: 'Passw0rd1' } });
      expect(again.json<LoginResponse>().accessToken).toBeTruthy();
      expect(seen).toEqual([]);
    } finally {
      off();
    }
  });
});
