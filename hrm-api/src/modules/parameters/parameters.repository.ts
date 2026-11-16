import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';

/** Stored effective-dated parameter rows (reads for settings screens + writes). */
export const parametersRepository = {
  listWorkspaceRows: (tx: Tx, workspaceId: string, keys: string[]) =>
    tx.workspaceParameter.findMany({ where: { workspaceId, key: { in: keys } }, orderBy: { effectiveFrom: 'asc' } }),

  findWorkspaceRow: (tx: Tx, workspaceId: string, key: string, effectiveFrom: Date) =>
    tx.workspaceParameter.findUnique({ where: { workspaceId_key_effectiveFrom: { workspaceId, key, effectiveFrom } } }),

  createWorkspaceRow: (tx: Tx, data: { workspaceId: string; key: string; value: Prisma.InputJsonValue; effectiveFrom: Date; reason: string; createdById: string }) =>
    tx.workspaceParameter.create({ data }),

  updateWorkspaceRow: (tx: Tx, id: string, data: { value: Prisma.InputJsonValue; reason: string; createdById: string }) =>
    tx.workspaceParameter.update({ where: { id }, data }),

  listSystemRows: (tx: Tx, keys: string[]) =>
    tx.systemParameter.findMany({ where: { key: { in: keys } }, orderBy: { effectiveFrom: 'asc' } }),

  findSystemRow: (tx: Tx, key: string, effectiveFrom: Date) =>
    tx.systemParameter.findUnique({ where: { key_effectiveFrom: { key, effectiveFrom } } }),

  createSystemRow: (tx: Tx, data: { key: string; value: Prisma.InputJsonValue; effectiveFrom: Date; reason: string; createdById: string }) =>
    tx.systemParameter.create({ data }),

  updateSystemRow: (tx: Tx, id: string, data: { value: Prisma.InputJsonValue; reason: string; createdById: string }) =>
    tx.systemParameter.update({ where: { id }, data }),

  userNames: async (tx: Tx, ids: string[]) => {
    const rows = ids.length ? await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
    return new Map(rows.map((r) => [r.id, r.displayName]));
  },

  workspaceTimezone: async (tx: Tx, workspaceId: string) =>
    (await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } })).timezone,
};
