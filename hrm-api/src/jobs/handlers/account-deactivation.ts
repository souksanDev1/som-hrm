import type { Db } from '../../db/client';
import { auditRepository } from '../../modules/audit/audit.repository';

/**
 * Safety net for FR-AUTH-06 / bug B1: logins linked to RESIGNED or TERMINATED employees are disabled
 * and their refresh tokens revoked. The employees service already does this on the status change;
 * this daily job catches anything missed (imports, direct fixes). Idempotent: only active users match.
 */
export const runAccountDeactivation = (db: Db, workspaceId: string, now: Date = new Date()): Promise<{ deactivated: number }> =>
  db.tenant(workspaceId, async (tx) => {
    const users = await tx.user.findMany({
      where: { workspaceId, isActive: true, employee: { status: { in: ['RESIGNED', 'TERMINATED'] } } },
      select: { id: true, employee: { select: { id: true, status: true } } },
    });
    for (const user of users) {
      await tx.user.update({ where: { id: user.id }, data: { isActive: false } });
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
      await auditRepository.create(tx, {
        workspaceId,
        actorUserId: null,
        action: 'user.deactivated',
        entity: 'User',
        entityId: user.id,
        meta: { reason: 'employment_ended', source: 'job', employeeId: user.employee?.id ?? null, status: user.employee?.status ?? null },
      });
    }
    return { deactivated: users.length };
  });
