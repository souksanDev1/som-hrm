import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';

export interface AuditEntry {
  workspaceId: string;
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}

export const auditRepository = {
  create: (tx: Tx, e: AuditEntry) =>
    tx.auditLog.create({
      data: {
        workspaceId: e.workspaceId,
        actorUserId: e.actorUserId,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        meta: e.meta,
        ip: e.ip ?? null,
      },
    }),

  list: async (tx: Tx, workspaceId: string, page: number, pageSize: number, entity?: string) => {
    const where: Prisma.AuditLogWhereInput = { workspaceId, ...(entity ? { entity } : {}) };
    const [items, total] = await Promise.all([
      tx.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      tx.auditLog.count({ where }),
    ]);
    const actorIds = [...new Set(items.map((i) => i.actorUserId).filter((v): v is string => !!v))];
    const actors = actorIds.length
      ? await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } })
      : [];
    return { items, total, actorNames: new Map(actors.map((a) => [a.id, a.displayName])) };
  },
};
