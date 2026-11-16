import type { Paginated, ParameterList, ParameterView, PlatformAuditLogEntry, PlatformLoginResponse, PlatformWorkspace, TokenPair } from '@hrm/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSecret } from '../src/lib/password';
import { parameterReader } from '../src/modules/parameters/parameters.service';
import { api, bearer, createTestContext, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const ADMIN_PASSWORD = 'Platform123';

/** A fresh SOM platform admin per test (platform tables are only reachable via db.system). */
const createPlatformAdmin = async () => {
  const email = `ops-${randomUUID().slice(0, 8)}@som.test`;
  await t.db.system(async (tx) =>
    tx.platformUser.create({ data: { email, displayName: `Ops ${email}`, passwordHash: await hashSecret(ADMIN_PASSWORD) } }),
  );
  return email;
};

const platformLogin = (email: string, password = ADMIN_PASSWORD) =>
  t.app.inject({ method: 'POST', url: api('/platform/auth/login'), payload: { email, password } });

const loginPlatform = async () => {
  const res = await platformLogin(await createPlatformAdmin());
  expect(res.statusCode).toBe(200);
  return res.json<PlatformLoginResponse>();
};

const newCode = () => `p-${randomUUID().slice(0, 8)}`;

const createWs = (token: string, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'POST', url: api('/platform/workspaces'), headers: bearer(token), payload });

describe('platform auth', () => {
  it('signs in, returns the principal and audits the login', async () => {
    const email = await createPlatformAdmin();
    const res = await platformLogin(email.toUpperCase());
    expect(res.statusCode).toBe(200);
    const body = res.json<PlatformLoginResponse>();
    expect(body.user.email).toBe(email);
    const me = await t.app.inject({ method: 'GET', url: api('/platform/auth/me'), headers: bearer(body.accessToken) });
    expect(me.json().email).toBe(email);
    const logs = await t.db.system((tx) => tx.platformAuditLog.findMany({ where: { actorId: body.user.id, action: 'platform.auth.login' } }));
    expect(logs).toHaveLength(1);
  });

  it('rejects unknown users and wrong passwords alike', async () => {
    const email = await createPlatformAdmin();
    const a = await platformLogin('nobody@som.test');
    const b = await platformLogin(email, 'wrong-pass1');
    expect([a.statusCode, b.statusCode]).toEqual([401, 401]);
    expect(a.json().error.code).toBe('invalid_credentials');
    expect(b.json().error.code).toBe('invalid_credentials');
  });

  it('locks the account after auth.lockout.maxAttempts failures (system parameter)', async () => {
    const email = await createPlatformAdmin();
    // Other suites may have changed the system value; read whatever is effective now.
    const maxAttempts = await t.db.system((tx) => parameterReader.system(tx, 'auth.lockout.maxAttempts'));
    for (let i = 0; i < maxAttempts - 1; i++) expect((await platformLogin(email, 'wrong-pass1')).statusCode).toBe(401);
    expect((await platformLogin(email, 'wrong-pass1')).statusCode).toBe(423);
    const ok = await platformLogin(email);
    expect(ok.statusCode).toBe(423);
    expect(ok.json().error.code).toBe('account_locked');
  });

  it('rotates refresh tokens and revokes every session on reuse', async () => {
    const login = await loginPlatform();
    const refresh = (refreshToken: string) => t.app.inject({ method: 'POST', url: api('/platform/auth/refresh'), payload: { refreshToken } });
    const first = await refresh(login.refreshToken);
    expect(first.statusCode).toBe(200);
    const rotated = first.json<TokenPair>();
    expect(rotated.refreshToken).not.toBe(login.refreshToken);

    expect((await refresh(login.refreshToken)).statusCode).toBe(401); // reuse
    expect((await refresh(rotated.refreshToken)).statusCode).toBe(401); // family revoked
    const audit = await t.db.system((tx) => tx.platformAuditLog.count({ where: { actorId: login.user.id, action: 'platform.auth.refresh_reuse' } }));
    expect(audit).toBe(2); // both presentations of a revoked token are flagged
  });

  it('logout revokes the refresh token', async () => {
    const login = await loginPlatform();
    const out = await t.app.inject({ method: 'POST', url: api('/platform/auth/logout'), payload: { refreshToken: login.refreshToken } });
    expect(out.statusCode).toBe(204);
    const again = await t.app.inject({ method: 'POST', url: api('/platform/auth/refresh'), payload: { refreshToken: login.refreshToken } });
    expect(again.statusCode).toBe(401);
  });

  it('keeps platform and tenant tokens apart', async () => {
    const platform = await loginPlatform();
    const ws = await createWorkspace(t.db);
    const tenant = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);

    const tenantRouteWithPlatformToken = await t.app.inject({ method: 'GET', url: api('/employees'), headers: bearer(platform.accessToken) });
    expect(tenantRouteWithPlatformToken.statusCode).toBe(401);
    const platformRouteWithTenantToken = await t.app.inject({ method: 'GET', url: api('/platform/workspaces'), headers: bearer(tenant.accessToken) });
    expect(platformRouteWithTenantToken.statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: api('/platform/workspaces') })).statusCode).toBe(401);
  });

  it('rejects a deactivated platform user', async () => {
    const login = await loginPlatform();
    await t.db.system((tx) => tx.platformUser.update({ where: { id: login.user.id }, data: { isActive: false } }));
    const res = await t.app.inject({ method: 'GET', url: api('/platform/auth/me'), headers: bearer(login.accessToken) });
    expect(res.statusCode).toBe(401);
  });
});

describe('platform workspaces', () => {
  it('creates a workspace whose owner can sign in on the tenant API with default parameters', async () => {
    const { accessToken } = await loginPlatform();
    const code = newCode();
    const res = await createWs(accessToken, {
      code, name: 'Acme Lao', seatLimit: 25, timezone: 'Asia/Bangkok',
      owner: { displayName: 'Acme Owner', email: `Owner@${code}.test`, password: 'Owner12345' },
    });
    expect(res.statusCode).toBe(201);
    const ws = res.json<PlatformWorkspace>();
    expect(ws).toMatchObject({ code, name: 'Acme Lao', seatLimit: 25, timezone: 'Asia/Bangkok', status: 'ACTIVE', employeeCount: 0, userCount: 1 });

    const owner = await loginAs(t.app, code, `owner@${code}.test`, 'Owner12345');
    expect(owner.user.roles).toEqual(['OWNER']);
    // FR-WS-08.4: a new workspace starts from the registry defaults (no rows needed).
    const params = await t.app.inject({ method: 'GET', url: api('/settings/parameters'), headers: bearer(owner.accessToken) });
    expect(params.json<ParameterList>().items.every((p) => p.source === 'default')).toBe(true);

    const audit = await t.db.system((tx) => tx.platformAuditLog.findFirst({ where: { action: 'platform.workspace.create', entityId: ws.id } }));
    expect(audit?.meta).toMatchObject({ code });
  });

  it('supports a phone-only owner', async () => {
    const { accessToken } = await loginPlatform();
    const code = newCode();
    const res = await createWs(accessToken, { code, name: 'Phone Co', owner: { displayName: 'P', phone: '020 7777 1234', password: 'Owner12345' } });
    expect(res.statusCode).toBe(201);
    const owner = await loginAs(t.app, code, '02077771234', 'Owner12345');
    expect(owner.user.roles).toEqual(['OWNER']);
  });

  it('validates input and rejects duplicate codes with workspace_code_taken', async () => {
    const { accessToken } = await loginPlatform();
    const noContact = await createWs(accessToken, { code: newCode(), name: 'X', owner: { displayName: 'X', password: 'Owner12345' } });
    expect(noContact.statusCode).toBe(400);
    const badTz = await createWs(accessToken, { code: newCode(), name: 'X', timezone: 'Mars/Base', owner: { displayName: 'X', email: 'x@x.test', password: 'Owner12345' } });
    expect(badTz.statusCode).toBe(400);

    const ws = await createWorkspace(t.db);
    const dup = await createWs(accessToken, { code: ws.code, name: 'Dup', owner: { displayName: 'D', email: 'd@d.test', password: 'Owner12345' } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('workspace_code_taken');
  });

  it('lists with search, status filter and seat usage', async () => {
    const { accessToken } = await loginPlatform();
    const ws = await createWorkspace(t.db, 7);
    await t.db.tenant(ws.workspaceId, (tx) =>
      tx.employee.createMany({
        data: [
          { workspaceId: ws.workspaceId, employeeCode: 'A1', firstName: 'A', lastName: 'A', gender: 'MALE', hireDate: new Date('2024-01-01'), contractType: 'INDEFINITE', payType: 'MONTHLY' },
          { workspaceId: ws.workspaceId, employeeCode: 'A2', firstName: 'B', lastName: 'B', gender: 'MALE', hireDate: new Date('2024-01-01'), contractType: 'INDEFINITE', payType: 'MONTHLY', status: 'RESIGNED' },
        ],
      }),
    );
    const list = await t.app.inject({ method: 'GET', url: api(`/platform/workspaces?search=${ws.code.toUpperCase()}`), headers: bearer(accessToken) });
    expect(list.statusCode).toBe(200);
    const page = list.json<Paginated<PlatformWorkspace>>();
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ code: ws.code, seatLimit: 7, employeeCount: 1 });

    const suspendedOnly = await t.app.inject({ method: 'GET', url: api(`/platform/workspaces?search=${ws.code}&status=SUSPENDED`), headers: bearer(accessToken) });
    expect(suspendedOnly.json<Paginated<PlatformWorkspace>>().total).toBe(0);
  });

  it('suspends (signing users out), reactivates and changes the seat limit — all audited', async () => {
    const { accessToken } = await loginPlatform();
    const ws = await createWorkspace(t.db);
    const tenant = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    const patch = (payload: object) =>
      t.app.inject({ method: 'PATCH', url: api(`/platform/workspaces/${ws.workspaceId}`), headers: bearer(accessToken), payload });

    const suspended = await patch({ status: 'SUSPENDED' });
    expect(suspended.statusCode).toBe(200);
    expect(suspended.json<PlatformWorkspace>().status).toBe('SUSPENDED');
    const refresh = await t.app.inject({ method: 'POST', url: api('/auth/refresh'), payload: { refreshToken: tenant.refreshToken } });
    expect(refresh.statusCode).toBe(401);

    const updated = await patch({ status: 'ACTIVE', seatLimit: 120, name: 'Renamed' });
    expect(updated.json<PlatformWorkspace>()).toMatchObject({ status: 'ACTIVE', seatLimit: 120, name: 'Renamed' });

    const logs = await t.app.inject({ method: 'GET', url: api('/platform/audit-logs?entity=Workspace&pageSize=100'), headers: bearer(accessToken) });
    const actions = logs.json<Paginated<PlatformAuditLogEntry>>().items.filter((l) => l.entityId === ws.workspaceId).map((l) => l.action);
    expect(actions).toEqual(['platform.workspace.activate', 'platform.workspace.suspend']);

    expect((await patch({})).statusCode).toBe(400);
    expect((await patch({ seatLimit: 0 })).statusCode).toBe(400);
  });

  it('returns 404 for an unknown workspace', async () => {
    const { accessToken } = await loginPlatform();
    const res = await t.app.inject({ method: 'GET', url: api('/platform/workspaces/nope'), headers: bearer(accessToken) });
    expect(res.statusCode).toBe(404);
  });
});

describe('system parameters (SOM only)', () => {
  const post = (token: string, payload: Record<string, unknown>) =>
    t.app.inject({ method: 'POST', url: api('/platform/parameters'), headers: bearer(token), payload });
  const future = '2099-01-01T00:00:00.000Z';

  it('lists only system keys with their current value and source', async () => {
    const { accessToken } = await loginPlatform();
    const res = await t.app.inject({ method: 'GET', url: api('/platform/parameters'), headers: bearer(accessToken) });
    expect(res.statusCode).toBe(200);
    const keys = res.json<ParameterList>().items.map((i) => i.key);
    expect(keys).toContain('auth.lockout.maxAttempts');
    expect(keys).not.toContain('document.expiryAlertDays');
  });

  it('validates value, scope and effective date', async () => {
    const { accessToken } = await loginPlatform();
    const base = { key: 'otp.length', value: 6, effectiveFrom: future, reason: 'test' };
    const range = await post(accessToken, { ...base, value: 99 });
    expect(range.statusCode).toBe(400);
    expect(range.json().error.code).toBe('out_of_range');
    expect((await post(accessToken, { ...base, value: 6.5 })).json().error.code).toBe('invalid_type');
    expect((await post(accessToken, { ...base, key: 'nope' })).json().error.code).toBe('unknown_parameter');
    expect((await post(accessToken, { ...base, key: 'document.expiryAlertDays', value: [30] })).json().error.code).toBe('not_a_system_parameter');
    const past = await post(accessToken, { ...base, effectiveFrom: '2020-01-01T00:00:00Z' });
    expect(past.statusCode).toBe(400);
    expect(past.json().error.code).toBe('effective_date_in_past');
  });

  it('schedules a future change without altering the current value, and audits old/new', async () => {
    const { accessToken, user } = await loginPlatform();
    const res = await post(accessToken, { key: 'otp.resendCooldownSeconds', value: 90, effectiveFrom: future, reason: 'Telco limit' });
    expect(res.statusCode).toBe(201);
    const view = res.json<ParameterView>();
    expect(view.currentValue).toBe(60);
    expect(view.scheduled.at(-1)).toMatchObject({ value: 90, effectiveFrom: future, reason: 'Telco limit', createdByName: user.displayName });

    const reader = await t.db.system(async (tx) => [await parameterReader.system(tx, 'otp.resendCooldownSeconds'), await parameterReader.system(tx, 'otp.resendCooldownSeconds', new Date('2099-06-01'))]);
    expect(reader).toEqual([60, 90]);

    const audit = await t.db.system((tx) => tx.platformAuditLog.findFirst({ where: { actorId: user.id, action: 'platform.parameter.change' } }));
    expect(audit?.meta).toMatchObject({ key: 'otp.resendCooldownSeconds', oldValue: 60, newValue: 90, reason: 'Telco limit' });
  });

  it('applies an immediate change and records it in history', async () => {
    const { accessToken } = await loginPlatform();
    // Same value as the default so other suites relying on defaults are unaffected.
    const res = await post(accessToken, { key: 'otp.maxPerHour', value: 5, effectiveFrom: new Date().toISOString(), reason: 'confirm default' });
    expect(res.statusCode).toBe(201);
    const view = res.json<ParameterView>();
    expect(view.source).toBe('configured');
    expect(view.history[0]).toMatchObject({ value: 5, reason: 'confirm default' });
  });

  it('is not reachable with a tenant token', async () => {
    const ws = await createWorkspace(t.db);
    const tenant = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    const res = await post(tenant.accessToken, { key: 'otp.length', value: 6, effectiveFrom: future, reason: 'x' });
    expect(res.statusCode).toBe(401);
  });
});
