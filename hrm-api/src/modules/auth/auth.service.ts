import {
  normalizeLaoPhone,
  type ChangePasswordInput,
  type ChangePinInput,
  type DeviceInfo,
  type ForgotCredentialInput,
  type LoginResponse,
  type Me,
  type OtpRequested,
  type PasswordLoginInput,
  type PinLoginInput,
  type ResetPasswordInput,
  type ResetPinInput,
  type TokenPair,
  type UpdateLocaleInput,
} from '@hrm/shared';
import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env';
import type { Db, Tx } from '../../db/client';
import { randomToken, sha256 } from '../../lib/crypto';
import { AppError, badRequest, conflict, forbidden, locked, unauthorized } from '../../lib/errors';
import { hashSecret, verifySecret } from '../../lib/password';
import type { AuthCache } from './auth-cache';
import type { SmsSender } from '../../lib/sms';
import { ensureDeviceBinding } from '../attendance/device-binding';
import { auditRepository } from '../audit/audit.repository';
import { parameterReader } from '../parameters/parameters.service';
import { authRepository, type IdentifierKind, type Principal } from './auth.repository';
import { issueOtp, maskPhone, verifyOtp } from './otp';

export interface AuthContext {
  userId: string;
  workspaceId: string;
  employeeId: string | null;
  roles: string[];
  permissions: string[];
}

export interface TokenSigner {
  sign(payload: { sub: string; ws: string }): string;
  accessTtlSeconds: number;
}

export const workspaceSuspended = () => forbidden('workspace_suspended');

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export const detectIdentifier = (raw: string): { kind: IdentifierKind; value: string } => {
  const value = raw.trim();
  if (value.includes('@')) return { kind: 'email', value: value.toLowerCase() };
  const phone = normalizeLaoPhone(value);
  if (/^[+\d\s-]+$/.test(value) && /^0(20\d{8}|30\d{7})$/.test(phone)) return { kind: 'phone', value: phone };
  return { kind: 'employeeCode', value };
};

export const toAuthContext = (p: Principal): AuthContext => ({
  userId: p.id,
  workspaceId: p.workspaceId,
  employeeId: p.employeeId,
  roles: p.roles,
  permissions: p.permissions,
});

/** `phoneVerification` is false when no SMS gateway can deliver codes (see createAuthService). */
const toMe = (p: Principal, phoneVerification: boolean): Me => {
  const ctx = toAuthContext(p);
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    workspaceName: p.workspaceName,
    displayName: p.displayName,
    email: p.email,
    roles: ctx.roles,
    permissions: ctx.permissions,
    employeeId: p.employeeId,
    mustChangeCredential: p.mustChangeCredential,
    phoneVerificationRequired: phoneVerification && !!p.phone && !p.phoneVerifiedAt,
    hasPassword: p.hasPassword,
    hasPin: p.hasPin,
    locale: p.locale === 'en' ? 'en' : 'lo',
  };
};

export type ResolvedAuth = { ctx: AuthContext; me: Me };

export const createAuthService = (db: Db, env: Env, signer: TokenSigner, sms: SmsSender, opts: { cache?: AuthCache<ResolvedAuth> } = {}) => {
  /**
   * First-login SMS verification (FR-AUTH-02.1) is enforced only when codes can actually be delivered:
   * in production the console sender reaches nobody, so gating would lock every user with a phone out.
   * REQUIRE_PHONE_VERIFICATION=false switches it off explicitly.
   */
  const phoneVerification = env.REQUIRE_PHONE_VERIFICATION && !(env.NODE_ENV === 'production' && sms.provider === 'console');

  /** Find the active user behind a public (unauthenticated) self-service request. */
  const findSelfServiceUser = async (tx: Tx, workspaceCode: string, identifier: string) => {
    const ws = await authRepository.findWorkspaceByCode(tx, workspaceCode);
    if (!ws || ws.status === 'SUSPENDED') return null;
    const id = detectIdentifier(identifier);
    const user = await authRepository.findUserByIdentifier(tx, ws.id, id.kind, id.value);
    return user && user.isActive ? user : null;
  };

  /** Shared OTP-based reset for password and PIN (FR-AUTH-02). */
  const resetWithOtp = async (
    input: ForgotCredentialInput & { code: string },
    data: { passwordHash?: string; pinHash?: string },
    action: 'auth.password_reset' | 'auth.pin_reset',
    meta: RequestMeta,
  ) => {
    const result = await db.system(async (tx) => {
      const user = await findSelfServiceUser(tx, input.workspaceCode, input.identifier);
      // Same answer as a wrong code: never reveal whether the account exists.
      if (!user) return { error: badRequest('otp_invalid') };
      const check = await verifyOtp(tx, user.id, 'PASSWORD_RESET', input.code);
      if (!check.ok) return { error: check.error };
      await authRepository.resetCredential(tx, user.id, data, user.phoneVerifiedAt);
      await authRepository.revokeAllForUser(tx, user.id);
      await auditRepository.create(tx, { workspaceId: user.workspaceId, actorUserId: user.id, action, entity: 'User', entityId: user.id, ip: meta.ip });
      return { value: undefined };
    });
    if ('error' in result) throw result.error;
  };

  /** `familyId` is new per sign-in and carried over on every rotation. */
  const issueTokens = async (
    tx: Tx,
    p: { id: string; workspaceId: string },
    meta: RequestMeta,
    familyId: string = randomUUID(),
  ): Promise<TokenPair> => {
    const refreshToken = randomToken();
    await authRepository.createRefreshToken(tx, {
      workspaceId: p.workspaceId,
      userId: p.id,
      tokenHash: sha256(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000),
      userAgent: meta.userAgent?.slice(0, 250),
    });
    return {
      accessToken: signer.sign({ sub: p.id, ws: p.workspaceId }),
      refreshToken,
      expiresIn: signer.accessTtlSeconds,
    };
  };

  /** Shared sign-in flow for password and PIN, with lockout and audit. */
  const login = async (
    workspaceCode: string,
    identifier: { kind: IdentifierKind; value: string },
    secret: string,
    secretField: 'passwordHash' | 'pinHash',
    meta: RequestMeta,
    device: Partial<DeviceInfo> = {},
  ): Promise<LoginResponse> => {
    const result = await db.system(async (tx) => {
      const ws = await authRepository.findWorkspaceByCode(tx, workspaceCode);
      const user = ws ? await authRepository.findUserByIdentifier(tx, ws.id, identifier.kind, identifier.value) : null;
      if (!ws || !user) {
        await verifySecret(secret, null); // equalise timing
        return { error: unauthorized('invalid_credentials') };
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) return { error: locked() };
      if (!user.isActive) return { error: new AppError(403, 'account_disabled') };

      const ok = await verifySecret(secret, user[secretField]);
      if (!ok) {
        const [maxAttempts, lockMinutes] = await Promise.all([
          parameterReader.system(tx, 'auth.lockout.maxAttempts'),
          parameterReader.system(tx, 'auth.lockout.minutes'),
        ]);
        const nowLocked = await authRepository.recordFailedAttempt(tx, user.id, maxAttempts, lockMinutes);
        await auditRepository.create(tx, {
          workspaceId: ws.id,
          actorUserId: user.id,
          action: nowLocked ? 'auth.locked' : 'auth.login_failed',
          entity: 'User',
          entityId: user.id,
          ip: meta.ip,
        });
        return { error: nowLocked ? locked() : unauthorized('invalid_credentials') };
      }
      // Checked after the secret so a suspended company code is not revealed to guessers.
      if (ws.status === 'SUSPENDED') return { error: workspaceSuspended() };

      await authRepository.recordSuccessfulLogin(tx, user.id);
      await auditRepository.create(tx, {
        workspaceId: ws.id,
        actorUserId: user.id,
        action: 'auth.login',
        entity: 'User',
        entityId: user.id,
        meta: { method: secretField === 'pinHash' ? 'PIN' : 'PASSWORD' },
        ip: meta.ip,
      });
      // Mobile sign-in binds the phone as the attendance device when the user has none yet (FR-ATT-11.1);
      // another phone still signs in, its punches are refused until the binding is moved.
      if (user.employeeId && device.deviceId && device.platform) {
        await ensureDeviceBinding(tx, ws.id, user.id, { deviceId: device.deviceId, platform: device.platform, model: device.model }, { ip: meta.ip });
      }
      const principal = await authRepository.findPrincipal(tx, user.id);
      const tokens = await issueTokens(tx, user, meta);
      return { value: { ...tokens, user: toMe(principal!, phoneVerification) } };
    });
    // Throw after the transaction so failed-attempt counters are committed.
    if ('error' in result) throw result.error;
    return result.value;
  };

  return {
    loginWithPassword: (input: PasswordLoginInput, meta: RequestMeta) =>
      login(input.workspaceCode, detectIdentifier(input.identifier), input.password, 'passwordHash', meta, input),

    loginWithPin: (input: PinLoginInput, meta: RequestMeta) =>
      login(input.workspaceCode, detectIdentifier(input.identifier), input.pin, 'pinHash', meta, input),

    /**
     * Rotate a refresh token. The old token is revoked with a conditional update, so of two
     * concurrent rotations only one wins; the loser (and any later replay) is treated as reuse
     * and revokes that token's family — other devices' sessions stay signed in.
     */
    refresh: async (refreshToken: string, meta: RequestMeta): Promise<TokenPair> => {
      const result = await db.system(async (tx) => {
        const stored = await authRepository.findRefreshToken(tx, sha256(refreshToken));
        if (!stored) return { error: unauthorized('invalid_refresh_token') };
        if (stored.revokedAt || !(await authRepository.revokeRefreshToken(tx, stored.id))) {
          await authRepository.revokeFamily(tx, stored.familyId);
          return { error: unauthorized('invalid_refresh_token') };
        }
        if (stored.expiresAt < new Date()) return { error: unauthorized('invalid_refresh_token') };
        const user = await tx.user.findUnique({ where: { id: stored.userId }, include: { workspace: { select: { status: true } } } });
        if (!user || !user.isActive) return { error: unauthorized('account_disabled') };
        if (user.workspace.status === 'SUSPENDED') return { error: workspaceSuspended() };
        return { value: await issueTokens(tx, user, meta, stored.familyId) };
      });
      if ('error' in result) throw result.error;
      return result.value;
    },

    logout: (refreshToken: string) =>
      db.system(async (tx) => {
        const stored = await authRepository.findRefreshToken(tx, sha256(refreshToken));
        if (stored && !stored.revokedAt) await authRepository.revokeRefreshToken(tx, stored.id);
      }),

    /**
     * Load the principal for an access token; used by the authenticate hook.
     * Returns null for unknown/disabled users; throws `workspace_suspended` (403).
     * Served from the auth cache when one is configured (see auth-cache.ts for how it stays fresh).
     */
    resolve: (workspaceId: string, userId: string): Promise<ResolvedAuth | null> => {
      const load = () =>
        db.tenant(workspaceId, async (tx): Promise<ResolvedAuth | null> => {
          const p = await authRepository.findPrincipal(tx, userId);
          if (!p || !p.isActive) return null;
          if (p.workspaceStatus === 'SUSPENDED') throw workspaceSuspended();
          return { ctx: toAuthContext(p), me: toMe(p, phoneVerification) };
        });
      return opts.cache ? opts.cache.get(workspaceId, userId, load) : load();
    },

    /**
     * Change the PIN, or set the first one. `currentPin` is required only when a PIN exists.
     * Setting an initial PIN does not clear `mustChangeCredential` (a temporary password may remain).
     */
    changePin: (ctx: AuthContext, input: ChangePinInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
        const initial = !user.pinHash;
        if (!initial) {
          if (!input.currentPin) throw badRequest('current_pin_required');
          if (!(await verifySecret(input.currentPin, user.pinHash))) throw badRequest('invalid_credentials');
        }
        await authRepository.updateCredential(tx, user.id, { pinHash: await hashSecret(input.newPin) }, !initial || !user.passwordHash);
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId, actorUserId: user.id, action: initial ? 'auth.pin_set' : 'auth.pin_changed', entity: 'User', entityId: user.id,
        });
      }),

    changePassword: (ctx: AuthContext, input: ChangePasswordInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
        if (!(await verifySecret(input.currentPassword, user.passwordHash))) throw badRequest('invalid_credentials');
        await authRepository.updateCredential(tx, user.id, { passwordHash: await hashSecret(input.newPassword) });
        await auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: user.id, action: 'auth.password_changed', entity: 'User', entityId: user.id });
      }),

    setLocale: (ctx: AuthContext, input: UpdateLocaleInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await authRepository.setLocale(tx, ctx.userId, input.locale);
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: 'auth.locale_changed', entity: 'User', entityId: ctx.userId, meta: { locale: input.locale },
        });
      }),

    /** Public: send a reset code if the account exists and has a phone. Always looks the same to the caller. */
    forgotCredential: async (input: ForgotCredentialInput): Promise<OtpRequested> => {
      const resendAfterSeconds = await db.system(async (tx) => {
        const cooldown = await parameterReader.system(tx, 'otp.resendCooldownSeconds');
        const user = await findSelfServiceUser(tx, input.workspaceCode, input.identifier);
        if (!user?.phone) return cooldown;
        try {
          await issueOtp(tx, sms, { workspaceId: user.workspaceId, userId: user.id, phone: user.phone, locale: user.locale }, 'PASSWORD_RESET');
          await auditRepository.create(tx, { workspaceId: user.workspaceId, actorUserId: user.id, action: 'auth.reset_code_sent', entity: 'User', entityId: user.id });
        } catch (err) {
          // Cooldown / hourly cap: silently skip so the response does not reveal the account.
          if (!(err instanceof AppError && err.statusCode === 429)) throw err;
        }
        return cooldown;
      });
      return { resendAfterSeconds, maskedPhone: null };
    },

    resetPassword: async (input: ResetPasswordInput, meta: RequestMeta) =>
      resetWithOtp(input, { passwordHash: await hashSecret(input.newPassword) }, 'auth.password_reset', meta),

    resetPin: async (input: ResetPinInput, meta: RequestMeta) =>
      resetWithOtp(input, { pinHash: await hashSecret(input.newPin) }, 'auth.pin_reset', meta),

    /** First-login phone verification (FR-AUTH-02.1): send a code to the user's own phone. */
    requestPhoneVerification: (ctx: AuthContext): Promise<OtpRequested> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
        if (!user.phone) throw badRequest('phone_missing');
        if (user.phoneVerifiedAt) throw conflict('phone_already_verified');
        const { resendAfterSeconds } = await issueOtp(
          tx, sms, { workspaceId: ctx.workspaceId, userId: user.id, phone: user.phone, locale: user.locale }, 'FIRST_LOGIN',
        );
        return { resendAfterSeconds, maskedPhone: maskPhone(user.phone) };
      }),

    confirmPhoneVerification: async (ctx: AuthContext, code: string) => {
      const result = await db.tenant(ctx.workspaceId, async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
        if (user.phoneVerifiedAt) return { error: conflict('phone_already_verified') };
        const check = await verifyOtp(tx, user.id, 'FIRST_LOGIN', code);
        if (!check.ok) return { error: check.error };
        await authRepository.setPhoneVerified(tx, user.id);
        await auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: user.id, action: 'auth.phone_verified', entity: 'User', entityId: user.id });
        return { value: undefined };
      });
      if ('error' in result) throw result.error;
    },
  };
};
export type AuthService = ReturnType<typeof createAuthService>;
