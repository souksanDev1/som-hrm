import type { LoginResponse, TokenPair } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSecret } from '../src/lib/password';
import { api, bearer, createTestContext, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const login = (payload: object) => t.app.inject({ method: 'POST', url: api('/auth/login'), payload });
const pinLogin = (payload: object) => t.app.inject({ method: 'POST', url: api('/auth/login/pin'), payload });

/** Field worker with no email: employee code + phone + PIN. */
const createPinWorker = async (ws: WorkspaceFixture, pin = '482913') =>
  t.db.tenant(ws.workspaceId, async (tx) => {
    const e = await tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: 'F100', firstName: 'A', lastName: 'B', gender: 'MALE',
        phone: '02055551111', hireDate: new Date('2024-01-01'), employmentType: 'DAILY',
      },
    });
    return tx.user.create({
      data: {
        workspaceId: ws.workspaceId, employeeId: e.id, displayName: 'A B', phone: '02055551111', pinHash: await hashSecret(pin),
        roles: { create: { workspaceId: ws.workspaceId, roleId: ws.roles.EMPLOYEE! } },
      },
    });
  });

describe('password login', () => {
  it('returns tokens and the principal with OWNER permissions', async () => {
    const ws = await createWorkspace(t.db);
    const res = await login({ workspaceCode: ws.code, identifier: ws.ownerEmail.toUpperCase(), password: OWNER_PASSWORD });
    expect(res.statusCode).toBe(200);
    const body = res.json<LoginResponse>();
    expect(body.accessToken).toBeTruthy();
    expect(body.user.roles).toEqual(['OWNER']);
    expect(body.user.permissions).toContain('employee.sensitive.read');
  });

  it('rejects unknown workspace and wrong password with the same error', async () => {
    const ws = await createWorkspace(t.db);
    const a = await login({ workspaceCode: 'nope-nope', identifier: ws.ownerEmail, password: OWNER_PASSWORD });
    const b = await login({ workspaceCode: ws.code, identifier: ws.ownerEmail, password: 'wrong-pass1' });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json().error.code).toBe('invalid_credentials');
    expect(b.json().error.code).toBe('invalid_credentials');
  });

  it('locks the account after too many failures (LOGIN_MAX_ATTEMPTS=3)', async () => {
    const ws = await createWorkspace(t.db);
    const bad = { workspaceCode: ws.code, identifier: ws.ownerEmail, password: 'wrong-pass1' };
    expect((await login(bad)).statusCode).toBe(401);
    expect((await login(bad)).statusCode).toBe(401);
    expect((await login(bad)).statusCode).toBe(423);
    // Even the right password is refused while locked.
    const ok = await login({ ...bad, password: OWNER_PASSWORD });
    expect(ok.statusCode).toBe(423);
    expect(ok.json().error.code).toBe('account_locked');
  });

  it('validates input with a 400 and field details', async () => {
    const res = await login({ workspaceCode: 'X', identifier: '', password: '' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
  });
});

describe('PIN login (staff without email)', () => {
  it('accepts employee code or phone number', async () => {
    const ws = await createWorkspace(t.db);
    await createPinWorker(ws);
    const byCode = await pinLogin({ workspaceCode: ws.code, identifier: 'F100', pin: '482913' });
    expect(byCode.statusCode).toBe(200);
    const byPhone = await pinLogin({ workspaceCode: ws.code, identifier: '+856 20 5555 1111', pin: '482913' });
    expect(byPhone.statusCode).toBe(200);
    expect(byPhone.json<LoginResponse>().user.roles).toEqual(['EMPLOYEE']);
  });

  it('rejects a wrong PIN and a non-numeric PIN', async () => {
    const ws = await createWorkspace(t.db);
    await createPinWorker(ws);
    expect((await pinLogin({ workspaceCode: ws.code, identifier: 'F100', pin: '000001' })).statusCode).toBe(401);
    expect((await pinLogin({ workspaceCode: ws.code, identifier: 'F100', pin: 'abcdef' })).statusCode).toBe(400);
  });

  it('lets the user change their PIN', async () => {
    const ws = await createWorkspace(t.db);
    await createPinWorker(ws);
    const { accessToken } = (await pinLogin({ workspaceCode: ws.code, identifier: 'F100', pin: '482913' })).json<LoginResponse>();
    const res = await t.app.inject({
      method: 'POST', url: api('/auth/change-pin'), headers: bearer(accessToken), payload: { currentPin: '482913', newPin: '730261' },
    });
    expect(res.statusCode).toBe(204);
    expect((await pinLogin({ workspaceCode: ws.code, identifier: 'F100', pin: '730261' })).statusCode).toBe(200);
  });
});

describe('tokens', () => {
  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const ws = await createWorkspace(t.db);
    const first = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    const refresh = (token: string) => t.app.inject({ method: 'POST', url: api('/auth/refresh'), payload: { refreshToken: token } });

    const r1 = await refresh(first.refreshToken);
    expect(r1.statusCode).toBe(200);
    const second = r1.json<TokenPair>();
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // Replaying the old token is treated as theft: everything is revoked.
    expect((await refresh(first.refreshToken)).statusCode).toBe(401);
    expect((await refresh(second.refreshToken)).statusCode).toBe(401);
  });

  it('protects routes and rejects disabled users immediately', async () => {
    const ws = await createWorkspace(t.db);
    expect((await t.app.inject({ method: 'GET', url: api('/auth/me') })).statusCode).toBe(401);
    const { accessToken, user } = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    expect((await t.app.inject({ method: 'GET', url: api('/auth/me'), headers: bearer(accessToken) })).json().id).toBe(user.id);
    await t.db.tenant(ws.workspaceId, (tx) => tx.user.update({ where: { id: user.id }, data: { isActive: false } }));
    const res = await t.app.inject({ method: 'GET', url: api('/auth/me'), headers: bearer(accessToken) });
    expect(res.statusCode).toBe(401);
  });

  it('writes an audit trail for logins', async () => {
    const ws = await createWorkspace(t.db);
    const { accessToken } = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    const res = await t.app.inject({ method: 'GET', url: api('/audit-logs'), headers: bearer(accessToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((i: { action: string }) => i.action)).toContain('auth.login');
  });
});
