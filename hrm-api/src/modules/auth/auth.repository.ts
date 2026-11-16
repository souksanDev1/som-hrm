import type { OtpPurpose } from '@prisma/client';
import type { Tx } from '../../db/client';

export type IdentifierKind = 'email' | 'phone' | 'employeeCode';

const principalInclude = {
  workspace: { select: { id: true, name: true, status: true } },
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} as const;

export const authRepository = {
  findWorkspaceByCode: (tx: Tx, code: string) => tx.workspace.findUnique({ where: { code } }),

  findUserByIdentifier: (tx: Tx, workspaceId: string, kind: IdentifierKind, value: string) => {
    switch (kind) {
      case 'email':
        return tx.user.findUnique({ where: { workspaceId_email: { workspaceId, email: value } } });
      case 'phone':
        return tx.user.findUnique({ where: { workspaceId_phone: { workspaceId, phone: value } } });
      case 'employeeCode':
        return tx.user.findFirst({ where: { workspaceId, employee: { employeeCode: value } } });
    }
  },

  findPrincipal: (tx: Tx, userId: string) =>
    tx.user.findUnique({ where: { id: userId }, include: principalInclude }),

  recordFailedAttempt: async (tx: Tx, userId: string, maxAttempts: number, lockMinutes: number) => {
    const user = await tx.user.update({ where: { id: userId }, data: { failedAttempts: { increment: 1 } } });
    if (user.failedAttempts >= maxAttempts) {
      await tx.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + lockMinutes * 60_000), failedAttempts: 0 },
      });
      return true;
    }
    return false;
  },

  recordSuccessfulLogin: (tx: Tx, userId: string) =>
    tx.user.update({ where: { id: userId }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } }),

  createRefreshToken: (
    tx: Tx,
    data: { workspaceId: string; userId: string; tokenHash: string; familyId: string; expiresAt: Date; userAgent?: string },
  ) => tx.refreshToken.create({ data }),

  findRefreshToken: (tx: Tx, tokenHash: string) => tx.refreshToken.findUnique({ where: { tokenHash } }),

  /**
   * Conditionally revoke one token. Returns false when it was already revoked — under concurrency
   * the second writer re-checks `revokedAt` after the first commits, so only one rotation wins.
   */
  revokeRefreshToken: async (tx: Tx, id: string) =>
    (await tx.refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } })).count === 1,

  revokeFamily: (tx: Tx, familyId: string) =>
    tx.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } }),

  revokeAllForUser: (tx: Tx, userId: string) =>
    tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),

  /** `clearMustChange` is false when only an initial PIN is set (the temporary password is still in place). */
  updateCredential: (tx: Tx, userId: string, data: { pinHash?: string; passwordHash?: string }, clearMustChange = true) =>
    tx.user.update({ where: { id: userId }, data: { ...data, ...(clearMustChange ? { mustChangeCredential: false } : {}) } }),

  /** Self-service reset via SMS OTP: new secret, lockout cleared, phone proven. */
  resetCredential: (tx: Tx, userId: string, data: { pinHash?: string; passwordHash?: string }, phoneVerifiedAt: Date | null) =>
    tx.user.update({
      where: { id: userId },
      data: { ...data, mustChangeCredential: false, failedAttempts: 0, lockedUntil: null, phoneVerifiedAt: phoneVerifiedAt ?? new Date() },
    }),

  setPhoneVerified: (tx: Tx, userId: string) => tx.user.update({ where: { id: userId }, data: { phoneVerifiedAt: new Date() } }),

  setLocale: (tx: Tx, userId: string, locale: string) => tx.user.update({ where: { id: userId }, data: { locale } }),

  // ── OTP challenges ──
  latestOtp: (tx: Tx, userId: string, purpose: OtpPurpose) =>
    tx.otpChallenge.findFirst({ where: { userId, purpose }, orderBy: { createdAt: 'desc' } }),

  countOtpSince: (tx: Tx, userId: string, purpose: OtpPurpose, since: Date) =>
    tx.otpChallenge.count({ where: { userId, purpose, createdAt: { gte: since } } }),

  /** A new code supersedes older ones. */
  consumeOpenOtps: (tx: Tx, userId: string, purpose: OtpPurpose) =>
    tx.otpChallenge.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: new Date() } }),

  createOtp: (tx: Tx, data: { workspaceId: string; userId: string; purpose: OtpPurpose; phone: string; codeHash: string; expiresAt: Date }) =>
    tx.otpChallenge.create({ data }),

  incrementOtpAttempts: (tx: Tx, id: string) => tx.otpChallenge.update({ where: { id }, data: { attempts: { increment: 1 } } }),

  /** Conditional so a code can be consumed exactly once even under concurrency. */
  consumeOtp: async (tx: Tx, id: string) =>
    (await tx.otpChallenge.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } })).count === 1,
};

export type Principal = NonNullable<Awaited<ReturnType<typeof authRepository.findPrincipal>>>;
