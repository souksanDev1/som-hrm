import type { Prisma, WorkspaceStatus } from '@prisma/client';
import type { Tx } from '../../db/client';

/** Statuses that no longer occupy a subscription seat. */
const SEATLESS_STATUSES = ['RESIGNED', 'TERMINATED'] as const;

export interface PlatformAuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Append-only audit trail for SOM platform actions. Must run inside `db.system`. */
export const platformAuditRepository = {
  create: (tx: Tx, e: PlatformAuditEntry) =>
    tx.platformAuditLog.create({
      data: { actorId: e.actorId, action: e.action, entity: e.entity, entityId: e.entityId ?? null, meta: e.meta, ip: e.ip ?? null },
    }),

  list: async (tx: Tx, page: number, pageSize: number, entity?: string) => {
    const where: Prisma.PlatformAuditLogWhereInput = entity ? { entity } : {};
    const [items, total] = await Promise.all([
      tx.platformAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      tx.platformAuditLog.count({ where }),
    ]);
    const actorIds = [...new Set(items.map((i) => i.actorId).filter((v): v is string => !!v))];
    return { items, total, actorNames: await platformUserRepository.namesById(tx, actorIds) };
  },
};

/** SOM staff accounts and their refresh tokens. Must run inside `db.system`. */
export const platformUserRepository = {
  findByEmail: (tx: Tx, email: string) => tx.platformUser.findUnique({ where: { email } }),
  findById: (tx: Tx, id: string) => tx.platformUser.findUnique({ where: { id } }),

  namesById: async (tx: Tx, ids: string[]) => {
    const rows = ids.length ? await tx.platformUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
    return new Map(rows.map((r) => [r.id, r.displayName]));
  },

  recordFailedAttempt: async (tx: Tx, id: string, maxAttempts: number, lockMinutes: number) => {
    const user = await tx.platformUser.update({ where: { id }, data: { failedAttempts: { increment: 1 } } });
    if (user.failedAttempts < maxAttempts) return false;
    await tx.platformUser.update({ where: { id }, data: { lockedUntil: new Date(Date.now() + lockMinutes * 60_000), failedAttempts: 0 } });
    return true;
  },

  recordSuccessfulLogin: (tx: Tx, id: string) =>
    tx.platformUser.update({ where: { id }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } }),

  createRefreshToken: (tx: Tx, data: { userId: string; tokenHash: string; familyId: string; expiresAt: Date }) =>
    tx.platformRefreshToken.create({ data }),
  findRefreshToken: (tx: Tx, tokenHash: string) => tx.platformRefreshToken.findUnique({ where: { tokenHash } }),
  revokeRefreshToken: (tx: Tx, id: string) => tx.platformRefreshToken.update({ where: { id }, data: { revokedAt: new Date() } }),
  revokeAllForUser: (tx: Tx, userId: string) =>
    tx.platformRefreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
};

const workspaceSelect = {
  id: true,
  code: true,
  name: true,
  timezone: true,
  status: true,
  createdAt: true,
  subscription: { select: { seatLimit: true } },
  _count: { select: { users: true } },
} as const;

/** Cross-tenant workspace administration. Must run inside `db.system`. */
export const platformWorkspaceRepository = {
  list: async (tx: Tx, q: { page: number; pageSize: number; search?: string; status?: WorkspaceStatus }) => {
    const where: Prisma.WorkspaceWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? { OR: [{ code: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      tx.workspace.findMany({ where, select: workspaceSelect, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      tx.workspace.count({ where }),
    ]);
    return { items, total, employeeCounts: await platformWorkspaceRepository.seatCounts(tx, items.map((i) => i.id)) };
  },

  findById: (tx: Tx, id: string) => tx.workspace.findUnique({ where: { id }, select: workspaceSelect }),
  findByCode: (tx: Tx, code: string) => tx.workspace.findUnique({ where: { code }, select: { id: true } }),

  /** Seat-occupying employees per workspace. */
  seatCounts: async (tx: Tx, workspaceIds: string[]) => {
    if (!workspaceIds.length) return new Map<string, number>();
    const rows = await tx.employee.groupBy({
      by: ['workspaceId'],
      where: { workspaceId: { in: workspaceIds }, status: { notIn: [...SEATLESS_STATUSES] } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.workspaceId, r._count._all]));
  },

  update: async (tx: Tx, id: string, data: { name?: string; status?: WorkspaceStatus; seatLimit?: number }) => {
    if (data.name !== undefined || data.status !== undefined) {
      await tx.workspace.update({ where: { id }, data: { name: data.name, status: data.status } });
    }
    if (data.seatLimit !== undefined) {
      await tx.subscription.upsert({ where: { workspaceId: id }, update: { seatLimit: data.seatLimit }, create: { workspaceId: id, seatLimit: data.seatLimit } });
    }
  },

  /** Sign every user of the workspace out (refresh tokens); access tokens expire on their own. */
  revokeTenantSessions: (tx: Tx, workspaceId: string) =>
    tx.refreshToken.updateMany({ where: { workspaceId, revokedAt: null }, data: { revokedAt: new Date() } }),
};

export type WorkspaceRow = NonNullable<Awaited<ReturnType<typeof platformWorkspaceRepository.findById>>>;
