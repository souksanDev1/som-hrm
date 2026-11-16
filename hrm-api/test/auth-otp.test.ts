import type { LoginResponse, OtpRequested } from '@hrm/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type AppInstance } from '../src/app';
import { createDb, type Db } from '../src/db/client';
import { hashSecret } from '../src/lib/password';
import { createConsoleSmsSender } from '../src/lib/sms';
import { maskPhone } from '../src/modules/auth/otp';
import { testEnv } from './env';
import { api, bearer, createWorkspace, loginAs, OWNER_PASSWORD, type WorkspaceFixture } from './helpers';

/** SMS OTP flows (FR-AUTH-02): first-login phone verification and self-service reset. */
const sms = createConsoleSmsSender();
let app: AppInstance;
let db: Db;

beforeAll(async () => {
  const env = testEnv();
  db = createDb(env.DATABASE_URL);
  app = await buildApp({ env, db, logger: false, sms });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.disconnect();
});
beforeEach(() => sms.clear());

const post = (url: string, payload?: object, token?: string) =>
  app.inject({ method: 'POST', url: api(url), payload, headers: token ? bearer(token) : undefined });
const get = (url: string, token: string) => app.inject({ method: 'GET', url: api(url), headers: bearer(token) });

/** Code from the last SMS sent to `phone`. */
const lastCode = (phone: string) => {
  const msg = [...sms.outbox].reverse().find((m) => m.to === phone);
  if (!msg) throw new Error(`no SMS to ${phone}`);
  return /\b(\d{6})\b/.exec(msg.body)![1]!;
};

let phoneSeq = 0;
const nextPhone = () => `0205${String(Date.now() % 1_000_000).padStart(6, '0')}${phoneSeq++ % 10}`.slice(0, 11);

const createStaff = async (ws: WorkspaceFixture, opts: { code: string; phone?: string | null; verified?: boolean; password?: string }) =>
  db.tenant(ws.workspaceId, async (tx) => {
    const phone = opts.phone === undefined ? nextPhone() : opts.phone;
    const e = await tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: opts.code, firstName: 'O', lastName: opts.code, gender: 'MALE',
        phone, hireDate: new Date('2024-01-01'), contractType: 'INDEFINITE', payType: 'DAILY',
      },
    });
    const user = await tx.user.create({
      data: {
        workspaceId: ws.workspaceId, employeeId: e.id, displayName: `O ${opts.code}`, phone,
        passwordHash: await hashSecret(opts.password ?? 'Start12345'), pinHash: await hashSecret('482913'),
        phoneVerifiedAt: opts.verified ? new Date() : null,
        roles: { create: { workspaceId: ws.workspaceId, roleId: ws.roles.EMPLOYEE! } },
      },
    });
    return { user, phone: phone ?? '' };
  });

const signIn = async (ws: WorkspaceFixture, identifier: string, password = 'Start12345') => {
  const res = await post('/auth/login', { workspaceCode: ws.code, identifier, password });
  expect(res.statusCode).toBe(200);
  return res.json<LoginResponse>();
};

describe('first-login phone verification (FR-AUTH-02.1)', () => {
  it('is not enforced when codes cannot be delivered (production + console sender) or when switched off', async () => {
    const ws = await createWorkspace(db);
    await createStaff(ws, { code: 'NV1' });
    const cases: Record<string, string>[] = [{ NODE_ENV: 'production' }, { REQUIRE_PHONE_VERIFICATION: 'false' }];
    for (const overrides of cases) {
      const env = testEnv(overrides);
      const other = await buildApp({ env, db, logger: false, sms: createConsoleSmsSender() });
      try {
        const res = await other.inject({ method: 'POST', url: api('/auth/login'), payload: { workspaceCode: ws.code, identifier: 'NV1', password: 'Start12345' } });
        expect(res.statusCode).toBe(200);
        const session = res.json<LoginResponse>();
        expect(session.user.phoneVerificationRequired).toBe(false);
        expect((await other.inject({ method: 'GET', url: api('/org/chart'), headers: bearer(session.accessToken) })).statusCode).toBe(200);
      } finally {
        await other.close();
      }
    }
  });

  it('gates the user until the phone is confirmed with the SMS code', async () => {
    const ws = await createWorkspace(db);
    const { phone } = await createStaff(ws, { code: 'V1' });
    const session = await signIn(ws, 'V1');
    expect(session.user.phoneVerificationRequired).toBe(true);

    const blocked = await get('/me/profile', session.accessToken);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('phone_verification_required');

    const requested = await post('/auth/phone/verify/request', undefined, session.accessToken);
    expect(requested.statusCode).toBe(202);
    expect(requested.json<OtpRequested>()).toEqual({ resendAfterSeconds: 60, maskedPhone: maskPhone(phone) });
    expect(sms.outbox).toHaveLength(1);
    const code = lastCode(phone);

    // Only a hash is stored.
    const stored = await db.system((tx) => tx.otpChallenge.findFirstOrThrow({ where: { phone } }));
    expect(stored.codeHash).not.toContain(code);

    const wrong = await post('/auth/phone/verify/confirm', { code: code === '000000' ? '111111' : '000000' }, session.accessToken);
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.code).toBe('otp_invalid');

    expect((await post('/auth/phone/verify/confirm', { code }, session.accessToken)).statusCode).toBe(204);
    expect((await get('/auth/me', session.accessToken)).json().phoneVerificationRequired).toBe(false);
    expect((await get('/me/profile', session.accessToken)).statusCode).toBe(200);

    // The consumed code cannot be used again.
    const again = await post('/auth/phone/verify/confirm', { code }, session.accessToken);
    expect(again.json().error.code).toBe('phone_already_verified');
  });

  it('does not gate users without a phone (HR-assisted path)', async () => {
    const ws = await createWorkspace(db);
    await createStaff(ws, { code: 'V2', phone: null });
    const session = await signIn(ws, 'V2');
    expect(session.user.phoneVerificationRequired).toBe(false);
    expect((await get('/me/profile', session.accessToken)).statusCode).toBe(200);
    const res = await post('/auth/phone/verify/request', undefined, session.accessToken);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('phone_missing');
  });

  it('enforces the resend cooldown and the hourly cap', async () => {
    const ws = await createWorkspace(db);
    const { user } = await createStaff(ws, { code: 'V3' });
    const { accessToken } = await signIn(ws, 'V3');
    expect((await post('/auth/phone/verify/request', undefined, accessToken)).statusCode).toBe(202);
    const tooSoon = await post('/auth/phone/verify/request', undefined, accessToken);
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.json().error.code).toBe('otp_resend_too_soon');

    // Age the challenges past the cooldown but within the hour, up to otp.maxPerHour (5).
    const age = () =>
      db.system((tx) =>
        tx.otpChallenge.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } }),
      );
    for (let i = 0; i < 4; i++) {
      await age();
      expect((await post('/auth/phone/verify/request', undefined, accessToken)).statusCode).toBe(202);
    }
    await age();
    const capped = await post('/auth/phone/verify/request', undefined, accessToken);
    expect(capped.statusCode).toBe(429);
    expect(capped.json().error.code).toBe('otp_limit_reached');
  });

  it('rejects expired codes and locks a code after too many wrong attempts', async () => {
    const ws = await createWorkspace(db);
    const { user, phone } = await createStaff(ws, { code: 'V4' });
    const { accessToken } = await signIn(ws, 'V4');
    await post('/auth/phone/verify/request', undefined, accessToken);
    const code = lastCode(phone);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 4; i++) {
      expect((await post('/auth/phone/verify/confirm', { code: wrong }, accessToken)).json().error.code).toBe('otp_invalid');
    }
    expect((await post('/auth/phone/verify/confirm', { code: wrong }, accessToken)).json().error.code).toBe('otp_too_many_attempts');
    // Even the right code is refused now.
    expect((await post('/auth/phone/verify/confirm', { code }, accessToken)).json().error.code).toBe('otp_too_many_attempts');

    // New code, then let it expire.
    await db.system((tx) => tx.otpChallenge.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } }));
    await post('/auth/phone/verify/request', undefined, accessToken);
    const fresh = lastCode(phone);
    await db.system((tx) => tx.otpChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } }));
    expect((await post('/auth/phone/verify/confirm', { code: fresh }, accessToken)).json().error.code).toBe('otp_expired');
  });
});

describe('forgot / reset password (FR-AUTH-02)', () => {
  it('answers the same whether or not the account exists, and texts only real phones', async () => {
    const ws = await createWorkspace(db);
    const { phone } = await createStaff(ws, { code: 'R1', verified: true });
    await createStaff(ws, { code: 'R2', phone: null, verified: true });

    const real = await post('/auth/password/forgot', { workspaceCode: ws.code, identifier: 'R1' });
    const noPhone = await post('/auth/password/forgot', { workspaceCode: ws.code, identifier: 'R2' });
    const unknown = await post('/auth/password/forgot', { workspaceCode: ws.code, identifier: 'NOPE' });
    const unknownWs = await post('/auth/password/forgot', { workspaceCode: 'no-such-co', identifier: 'R1' });
    for (const res of [real, noPhone, unknown, unknownWs]) {
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ resendAfterSeconds: 60, maskedPhone: null });
    }
    expect(sms.outbox.map((m) => m.to)).toEqual([phone]);

    // A second request within the cooldown is silently dropped (still 202).
    expect((await post('/auth/password/forgot', { workspaceCode: ws.code, identifier: 'R1' })).statusCode).toBe(202);
    expect(sms.outbox).toHaveLength(1);
  });

  it('resets the password, clears lockout, revokes sessions and audits', async () => {
    const ws = await createWorkspace(db);
    const { user, phone } = await createStaff(ws, { code: 'R3', verified: true });
    const old = await signIn(ws, 'R3');
    await db.system((tx) => tx.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + 3_600_000), failedAttempts: 2 } }));

    await post('/auth/password/forgot', { workspaceCode: ws.code, identifier: phone });
    const code = lastCode(phone);
    const reset = { workspaceCode: ws.code, identifier: 'R3', code, newPassword: 'Brand9New' };
    expect((await post('/auth/password/reset', { ...reset, newPassword: 'short' })).statusCode).toBe(400);
    expect((await post('/auth/password/reset', reset)).statusCode).toBe(204);

    expect((await post('/auth/refresh', { refreshToken: old.refreshToken })).statusCode).toBe(401);
    expect((await post('/auth/login', { workspaceCode: ws.code, identifier: 'R3', password: 'Start12345' })).statusCode).toBe(401);
    await signIn(ws, 'R3', 'Brand9New');

    // Consumed code cannot be reused.
    const reuse = await post('/auth/password/reset', { ...reset, newPassword: 'Other9Pass' });
    expect(reuse.statusCode).toBe(400);
    expect(reuse.json().error.code).toBe('otp_invalid');

    const audit = await db.system((tx) => tx.auditLog.findMany({ where: { workspaceId: ws.workspaceId, entityId: user.id } }));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['auth.reset_code_sent', 'auth.password_reset']));
  });

  it('resets the PIN with the same code flow', async () => {
    const ws = await createWorkspace(db);
    const { phone } = await createStaff(ws, { code: 'R4', verified: true });
    await post('/auth/password/forgot', { workspaceCode: ws.code, identifier: 'R4' });
    const res = await post('/auth/pin/reset', { workspaceCode: ws.code, identifier: 'R4', code: lastCode(phone), newPin: '730261' });
    expect(res.statusCode).toBe(204);
    expect((await post('/auth/login/pin', { workspaceCode: ws.code, identifier: 'R4', pin: '730261' })).statusCode).toBe(200);
  });

  it('isolates codes per workspace and refuses suspended workspaces', async () => {
    const a = await createWorkspace(db);
    const b = await createWorkspace(db);
    const { phone } = await createStaff(a, { code: 'R5', verified: true });
    await createStaff(b, { code: 'R5', verified: true });
    await post('/auth/password/forgot', { workspaceCode: a.code, identifier: 'R5' });
    const code = lastCode(phone);
    const cross = await post('/auth/password/reset', { workspaceCode: b.code, identifier: 'R5', code, newPassword: 'Cross9Pass' });
    expect(cross.json().error.code).toBe('otp_invalid');

    await db.system((tx) => tx.workspace.update({ where: { id: a.workspaceId }, data: { status: 'SUSPENDED' } }));
    const suspended = await post('/auth/password/reset', { workspaceCode: a.code, identifier: 'R5', code, newPassword: 'Cross9Pass' });
    expect(suspended.json().error.code).toBe('otp_invalid');
    sms.clear();
    expect((await post('/auth/password/forgot', { workspaceCode: a.code, identifier: 'R5' })).statusCode).toBe(202);
    expect(sms.outbox).toHaveLength(0);
  });

  it('marks the phone verified after a successful reset', async () => {
    const ws = await createWorkspace(db);
    const { phone } = await createStaff(ws, { code: 'R6' });
    await post('/auth/password/forgot', { workspaceCode: ws.code, identifier: 'R6' });
    await post('/auth/password/reset', { workspaceCode: ws.code, identifier: 'R6', code: lastCode(phone), newPassword: 'Brand9New' });
    expect((await signIn(ws, 'R6', 'Brand9New')).user.phoneVerificationRequired).toBe(false);
  });
});

describe('owner (no phone) is unaffected', () => {
  it('signs in without any setup step', async () => {
    const ws = await createWorkspace(db);
    const { user } = await loginAs(app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    expect(user.phoneVerificationRequired).toBe(false);
  });
});
