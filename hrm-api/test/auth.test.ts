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
const refresh = (token: string) => t.app.inject({ method: 'POST', url: api('/auth/refresh'), payload: { refreshToken: token } });

/** Field worker with no email: employee code + phone + PIN. */
const createPinWorker = async (ws: WorkspaceFixture, pin = '482913') =>
  t.db.tenant(ws.workspaceId, async (tx) => {
    const e = await tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: 'F100', firstName: 'A', lastName: 'B', gender: 'MALE',
        phone: '02055551111', hireDate: new Date('2024-01-01'), contractType: 'INDEFINITE', payType: 'DAILY',
      },
    });
    return tx.user.create({
      data: {
        workspaceId: ws.workspaceId, employeeId: e.id, displayName: 'A B', phone: '02055551111', pinHash: await hashSecret(pin),
        roles: { create: { workspaceId: ws.workspaceId, roleId: ws.roles.EMPLOYEE! } },
      },
    });
  });

/** Staff user with employee code + phone + password, created directly (HR issuing is tested elsewhere). */
const createStaffUser = async (
  ws: WorkspaceFixture,
  opts: { code: string; phone: string; password?: string; pin?: string; mustChange?: boolean; phoneVerified?: boolean },
) =>
  t.db.tenant(ws.workspaceId, async (tx) => {
    const e = await tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: opts.code, firstName: 'S', lastName: opts.code, gender: 'FEMALE',
        phone: opts.phone, hireDate: new Date('2024-01-01'), contractType: 'INDEFINITE', payType: 'MONTHLY',
      },
    });
    return tx.user.create({
      data: {
        workspaceId: ws.workspaceId, employeeId: e.id, displayName: `S ${opts.code}`, phone: opts.phone,
        passwordHash: opts.password ? await hashSecret(opts.password) : null,
        pinHash: opts.pin ? await hashSecret(opts.pin) : null,
        mustChangeCredential: opts.mustChange ?? false,
        phoneVerifiedAt: opts.phoneVerified === false ? null : new Date(),
        roles: { create: { workspaceId: ws.workspaceId, roleId: ws.roles.EMPLOYEE! } },
      },
    });
  });

const suspend = (ws: WorkspaceFixture) =>
  t.db.system((tx) => tx.workspace.update({ where: { id: ws.workspaceId }, data: { status: 'SUSPENDED' } }));

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

  it('locks the account after the default 5 failures (auth.lockout.maxAttempts)', async () => {
    const ws = await createWorkspace(t.db);
    const bad = { workspaceCode: ws.code, identifier: ws.ownerEmail, password: 'wrong-pass1' };
    for (let i = 0; i < 4; i++) expect((await login(bad)).statusCode).toBe(401);
    expect((await login(bad)).statusCode).toBe(423);
    // Even the right password is refused while locked.
    const ok = await login({ ...bad, password: OWNER_PASSWORD });
    expect(ok.statusCode).toBe(423);
    expect(ok.json().error.code).toBe('account_locked');
  });

  it('reads the lockout threshold from the system parameter', async () => {
    const ws = await createWorkspace(t.db);
    const row = await t.db.system((tx) =>
      tx.systemParameter.create({ data: { key: 'auth.lockout.maxAttempts', value: 3, effectiveFrom: new Date(Date.now() - 1000) } }),
    );
    try {
      const bad = { workspaceCode: ws.code, identifier: ws.ownerEmail, password: 'wrong-pass1' };
      expect((await login(bad)).statusCode).toBe(401);
      expect((await login(bad)).statusCode).toBe(401);
      expect((await login(bad)).statusCode).toBe(423);
    } finally {
      await t.db.system((tx) => tx.systemParameter.delete({ where: { id: row.id } }));
    }
  });

  it('signs in with employee code + password and with phone + password (FR-AUTH-01.1/01.2)', async () => {
    const ws = await createWorkspace(t.db);
    await createStaffUser(ws, { code: 'S200', phone: '02055552000', password: 'Staff12345' });
    const byCode = await login({ workspaceCode: ws.code, identifier: 'S200', password: 'Staff12345' });
    expect(byCode.statusCode).toBe(200);
    const byPhone = await login({ workspaceCode: ws.code, identifier: '020 5555 2000', password: 'Staff12345' });
    expect(byPhone.statusCode).toBe(200);
    expect(byPhone.json<LoginResponse>().user.id).toBe(byCode.json<LoginResponse>().user.id);
  });

  it('keeps identifiers isolated per workspace', async () => {
    const a = await createWorkspace(t.db);
    const b = await createWorkspace(t.db);
    await createStaffUser(a, { code: 'S300', phone: '02055553000', password: 'AlphaPass1' });
    await createStaffUser(b, { code: 'S300', phone: '02055553000', password: 'BravoPass1' });
    expect((await login({ workspaceCode: a.code, identifier: 'S300', password: 'AlphaPass1' })).statusCode).toBe(200);
    expect((await login({ workspaceCode: b.code, identifier: 'S300', password: 'AlphaPass1' })).statusCode).toBe(401);
    const resB = await login({ workspaceCode: b.code, identifier: '02055553000', password: 'BravoPass1' });
    expect(resB.json<LoginResponse>().user.workspaceId).toBe(b.workspaceId);
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

describe('initial PIN (B5)', () => {
  const changePin = (token: string, payload: object) =>
    t.app.inject({ method: 'POST', url: api('/auth/change-pin'), headers: bearer(token), payload });

  it('lets a user without a PIN set one without currentPin, then requires it', async () => {
    const ws = await createWorkspace(t.db);
    const { accessToken, user } = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    expect(user.hasPin).toBe(false);
    expect((await changePin(accessToken, { newPin: '730261' })).statusCode).toBe(204);
    const me = await t.app.inject({ method: 'GET', url: api('/auth/me'), headers: bearer(accessToken) });
    expect(me.json().hasPin).toBe(true);

    const again = await changePin(accessToken, { newPin: '730262' });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe('current_pin_required');
    expect((await changePin(accessToken, { currentPin: '000000', newPin: '730262' })).json().error.code).toBe('invalid_credentials');
    expect((await changePin(accessToken, { currentPin: '730261', newPin: '730262' })).statusCode).toBe(204);
  });

  it('does not clear a forced password change when only an initial PIN is set', async () => {
    const ws = await createWorkspace(t.db);
    await createStaffUser(ws, { code: 'S400', phone: '02055554000', password: 'TempPass12', mustChange: true });
    const { accessToken } = (await login({ workspaceCode: ws.code, identifier: 'S400', password: 'TempPass12' })).json<LoginResponse>();
    expect((await changePin(accessToken, { newPin: '730261' })).statusCode).toBe(204);
    const me = await t.app.inject({ method: 'GET', url: api('/auth/me'), headers: bearer(accessToken) });
    expect(me.json().mustChangeCredential).toBe(true);
  });

  it('rejects weak PINs', async () => {
    const ws = await createWorkspace(t.db);
    const { accessToken } = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    expect((await changePin(accessToken, { newPin: '111111' })).statusCode).toBe(400);
  });
});

describe('forced credential change gate (B4)', () => {
  it('blocks every other route until the temporary secret is replaced', async () => {
    const ws = await createWorkspace(t.db);
    await createStaffUser(ws, { code: 'S500', phone: '02055555000', password: 'TempPass12', mustChange: true });
    const res = await login({ workspaceCode: ws.code, identifier: 'S500', password: 'TempPass12' });
    const { accessToken, refreshToken, user } = res.json<LoginResponse>();
    expect(user.mustChangeCredential).toBe(true);
    const headers = bearer(accessToken);

    const blocked = await t.app.inject({ method: 'GET', url: api('/me/profile'), headers });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('credential_change_required');
    expect((await t.app.inject({ method: 'GET', url: api('/org/chart'), headers })).statusCode).toBe(403);

    // Allowed while pending: me, locale, change-password, logout.
    expect((await t.app.inject({ method: 'GET', url: api('/auth/me'), headers })).statusCode).toBe(200);
    expect((await t.app.inject({ method: 'PATCH', url: api('/auth/me/locale'), headers, payload: { locale: 'en' } })).statusCode).toBe(204);
    const changed = await t.app.inject({
      method: 'POST', url: api('/auth/change-password'), headers, payload: { currentPassword: 'TempPass12', newPassword: 'MyOwnPass9' },
    });
    expect(changed.statusCode).toBe(204);

    const after = await t.app.inject({ method: 'GET', url: api('/me/profile'), headers });
    expect(after.statusCode).toBe(200);
    expect((await t.app.inject({ method: 'POST', url: api('/auth/logout'), payload: { refreshToken } })).statusCode).toBe(204);
  });
});

describe('language (FR-WS-07.2)', () => {
  it('persists the user locale', async () => {
    const ws = await createWorkspace(t.db);
    const { accessToken, user } = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    expect(user.locale).toBe('lo');
    const res = await t.app.inject({ method: 'PATCH', url: api('/auth/me/locale'), headers: bearer(accessToken), payload: { locale: 'en' } });
    expect(res.statusCode).toBe(204);
    expect((await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).user.locale).toBe('en');
    const bad = await t.app.inject({ method: 'PATCH', url: api('/auth/me/locale'), headers: bearer(accessToken), payload: { locale: 'fr' } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('suspended workspace', () => {
  it('rejects login, refresh and existing access tokens with workspace_suspended', async () => {
    const ws = await createWorkspace(t.db);
    const session = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    await suspend(ws);

    const res = await login({ workspaceCode: ws.code, identifier: ws.ownerEmail, password: OWNER_PASSWORD });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('workspace_suspended');
    // Wrong password still looks like any other failure.
    expect((await login({ workspaceCode: ws.code, identifier: ws.ownerEmail, password: 'wrong-pass1' })).statusCode).toBe(401);

    const refreshed = await t.app.inject({ method: 'POST', url: api('/auth/refresh'), payload: { refreshToken: session.refreshToken } });
    expect(refreshed.statusCode).toBe(403);
    expect(refreshed.json().error.code).toBe('workspace_suspended');

    const me = await t.app.inject({ method: 'GET', url: api('/auth/me'), headers: bearer(session.accessToken) });
    expect(me.statusCode).toBe(403);
    expect(me.json().error.code).toBe('workspace_suspended');
  });
});

describe('tokens', () => {
  it('rotates refresh tokens and revokes only the reused family', async () => {
    const ws = await createWorkspace(t.db);
    const first = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    const otherDevice = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);

    const r1 = await refresh(first.refreshToken);
    expect(r1.statusCode).toBe(200);
    const second = r1.json<TokenPair>();
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // Replaying the old token is treated as theft: that family is revoked...
    expect((await refresh(first.refreshToken)).statusCode).toBe(401);
    expect((await refresh(second.refreshToken)).statusCode).toBe(401);
    // ...but the user's other session keeps working.
    expect((await refresh(otherDevice.refreshToken)).statusCode).toBe(200);
  });

  it('lets exactly one of two concurrent refreshes with the same token succeed', async () => {
    const ws = await createWorkspace(t.db);
    const { refreshToken } = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    const tokens = await t.db.system((tx) => tx.refreshToken.findMany({ where: { workspaceId: ws.workspaceId } }));
    // The original token plus exactly one rotated token; both revoked (the loser counts as reuse).
    expect(tokens).toHaveLength(2);
    expect(tokens.every((tk) => tk.revokedAt)).toBe(true);
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
