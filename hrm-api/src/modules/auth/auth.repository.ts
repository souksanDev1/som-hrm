import type { Tx } from '../../db/client';

export type IdentifierKind = 'email' | 'phone' | 'employeeCode';

const principalInclude = {
  workspace: { select: { id: true, name: true } },
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
    data: { workspaceId: string; userId: string; tokenHash: string; expiresAt: Date; userAgent?: string },
  ) => tx.refreshToken.create({ data }),

  findRefreshToken: (tx: Tx, tokenHash: string) => tx.refreshToken.findUnique({ where: { tokenHash } }),

  revokeRefreshToken: (tx: Tx, id: string) =>
    tx.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } }),

  revokeAllForUser: (tx: Tx, userId: string) =>
    tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),

  updateCredential: (tx: Tx, userId: string, data: { pinHash?: string; passwordHash?: string }) =>
    tx.user.update({ where: { id: userId }, data: { ...data, mustChangeCredential: false } }),
};

export type Principal = NonNullable<Awaited<ReturnType<typeof authRepository.findPrincipal>>>;
