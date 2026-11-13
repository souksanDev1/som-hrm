import {
  normalizeLaoPhone,
  type ChangePasswordInput,
  type ChangePinInput,
  type LoginResponse,
  type Me,
  type PasswordLoginInput,
  type PinLoginInput,
  type TokenPair,
} from '@hrm/shared';
import type { Env } from '../../config/env';
import type { Db, Tx } from '../../db/client';
import { randomToken, sha256 } from '../../lib/crypto';
import { AppError, badRequest, locked, unauthorized } from '../../lib/errors';
import { hashSecret, verifySecret } from '../../lib/password';
import { auditRepository } from '../audit/audit.repository';
import { authRepository, type IdentifierKind, type Principal } from './auth.repository';

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

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const detectIdentifier = (raw: string): { kind: IdentifierKind; value: string } => {
  const value = raw.trim();
  if (value.includes('@')) return { kind: 'email', value: value.toLowerCase() };
  const phone = normalizeLaoPhone(value);
  if (/^[+\d\s-]+$/.test(value) && /^0(20\d{8}|30\d{7})$/.test(phone)) return { kind: 'phone', value: phone };
  return { kind: 'employeeCode', value };
};

export const toAuthContext = (p: Principal): AuthContext => {
  const permissions = new Set<string>();
  p.roles.forEach((ur) => ur.role.permissions.forEach((rp) => permissions.add(rp.permission.key)));
  return {
    userId: p.id,
    workspaceId: p.workspaceId,
    employeeId: p.employeeId,
    roles: p.roles.map((ur) => ur.role.code),
    permissions: [...permissions].sort(),
  };
};

const toMe = (p: Principal): Me => {
  const ctx = toAuthContext(p);
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    workspaceName: p.workspace.name,
    displayName: p.displayName,
    email: p.email,
    roles: ctx.roles,
    permissions: ctx.permissions,
    employeeId: p.employeeId,
    mustChangeCredential: p.mustChangeCredential,
    locale: p.locale === 'en' ? 'en' : 'lo',
  };
};

export const createAuthService = (db: Db, env: Env, signer: TokenSigner) => {
  const issueTokens = async (tx: Tx, p: { id: string; workspaceId: string }, meta: RequestMeta): Promise<TokenPair> => {
    const refreshToken = randomToken();
    await authRepository.createRefreshToken(tx, {
      workspaceId: p.workspaceId,
      userId: p.id,
      tokenHash: sha256(refreshToken),
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
        const nowLocked = await authRepository.recordFailedAttempt(tx, user.id, env.LOGIN_MAX_ATTEMPTS, env.LOGIN_LOCK_MINUTES);
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
      const principal = await authRepository.findPrincipal(tx, user.id);
      const tokens = await issueTokens(tx, user, meta);
      return { value: { ...tokens, user: toMe(principal!) } };
    });
    // Throw after the transaction so failed-attempt counters are committed.
    if ('error' in result) throw result.error;
    return result.value;
  };

  return {
    loginWithPassword: (input: PasswordLoginInput, meta: RequestMeta) =>
      login(input.workspaceCode, detectIdentifier(input.identifier), input.password, 'passwordHash', meta),

    loginWithPin: (input: PinLoginInput, meta: RequestMeta) =>
      login(input.workspaceCode, detectIdentifier(input.identifier), input.pin, 'pinHash', meta),

    /** Rotate a refresh token. Re-use of a revoked token revokes the whole family. */
    refresh: async (refreshToken: string, meta: RequestMeta): Promise<TokenPair> => {
      const result = await db.system(async (tx) => {
        const stored = await authRepository.findRefreshToken(tx, sha256(refreshToken));
        if (!stored) return { error: unauthorized('invalid_refresh_token') };
        if (stored.revokedAt) {
          await authRepository.revokeAllForUser(tx, stored.userId);
          return { error: unauthorized('invalid_refresh_token') };
        }
        if (stored.expiresAt < new Date()) return { error: unauthorized('invalid_refresh_token') };
        const user = await tx.user.findUnique({ where: { id: stored.userId } });
        if (!user || !user.isActive) return { error: unauthorized('account_disabled') };
        await authRepository.revokeRefreshToken(tx, stored.id);
        return { value: await issueTokens(tx, user, meta) };
      });
      if ('error' in result) throw result.error;
      return result.value;
    },

    logout: (refreshToken: string) =>
      db.system(async (tx) => {
        const stored = await authRepository.findRefreshToken(tx, sha256(refreshToken));
        if (stored && !stored.revokedAt) await authRepository.revokeRefreshToken(tx, stored.id);
      }),

    /** Load the principal for an access token; used by the authenticate hook. */
    resolve: (workspaceId: string, userId: string): Promise<{ ctx: AuthContext; me: Me } | null> =>
      db.tenant(workspaceId, async (tx) => {
        const p = await authRepository.findPrincipal(tx, userId);
        if (!p || !p.isActive) return null;
        return { ctx: toAuthContext(p), me: toMe(p) };
      }),

    changePin: (ctx: AuthContext, input: ChangePinInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
        if (!(await verifySecret(input.currentPin, user.pinHash))) throw badRequest('invalid_credentials');
        await authRepository.updateCredential(tx, user.id, { pinHash: await hashSecret(input.newPin) });
        await auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: user.id, action: 'auth.pin_changed', entity: 'User', entityId: user.id });
      }),

    changePassword: (ctx: AuthContext, input: ChangePasswordInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
        if (!(await verifySecret(input.currentPassword, user.passwordHash))) throw badRequest('invalid_credentials');
        await authRepository.updateCredential(tx, user.id, { passwordHash: await hashSecret(input.newPassword) });
        await auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: user.id, action: 'auth.password_changed', entity: 'User', entityId: user.id });
      }),
  };
};
export type AuthService = ReturnType<typeof createAuthService>;
