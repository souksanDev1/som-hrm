import type { AuditLogEntry, Paginated } from '@hrm/shared';
import type { Db } from '../../db/client';
import { auditRepository } from './audit.repository';

export const createAuditService = (db: Db) => ({
  async list(workspaceId: string, page: number, pageSize: number, entity?: string): Promise<Paginated<AuditLogEntry>> {
    return db.tenant(workspaceId, async (tx) => {
      const { items, total, actorNames } = await auditRepository.list(tx, workspaceId, page, pageSize, entity);
      return {
        items: items.map((i) => ({
          id: i.id,
          action: i.action,
          entity: i.entity,
          entityId: i.entityId,
          actorName: i.actorUserId ? (actorNames.get(i.actorUserId) ?? null) : null,
          createdAt: i.createdAt.toISOString(),
          meta: i.meta ?? null,
        })),
        total,
        page,
        pageSize,
      };
    });
  },
});
export type AuditService = ReturnType<typeof createAuditService>;
