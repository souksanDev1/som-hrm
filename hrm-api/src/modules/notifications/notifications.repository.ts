import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';

export const notificationsRepository = {
  list: async (tx: Tx, workspaceId: string, userId: string, q: { page: number; pageSize: number; unread?: boolean }) => {
    const where: Prisma.NotificationWhereInput = { workspaceId, userId, ...(q.unread ? { readAt: null } : {}) };
    const [items, total] = await Promise.all([
      tx.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      tx.notification.count({ where }),
    ]);
    return { items, total };
  },

  countUnread: (tx: Tx, workspaceId: string, userId: string) => tx.notification.count({ where: { workspaceId, userId, readAt: null } }),

  findOwn: (tx: Tx, workspaceId: string, userId: string, id: string) => tx.notification.findFirst({ where: { id, workspaceId, userId } }),

  markRead: (tx: Tx, id: string, at: Date) => tx.notification.update({ where: { id }, data: { readAt: at } }),

  markAllRead: (tx: Tx, workspaceId: string, userId: string, at: Date) =>
    tx.notification.updateMany({ where: { workspaceId, userId, readAt: null }, data: { readAt: at } }),

  /** Recipients with what is needed to pick channels and the language. */
  findRecipients: (tx: Tx, workspaceId: string, userIds: string[]) =>
    tx.user.findMany({
      where: { workspaceId, id: { in: userIds }, isActive: true },
      select: { id: true, locale: true, phone: true, _count: { select: { pushTokens: true } } },
    }),

  /** Inserts notifications, silently skipping (workspaceId, userId, dedupeKey) duplicates; returns only new rows. */
  createMany: (tx: Tx, data: Prisma.NotificationCreateManyInput[]) =>
    tx.notification.createManyAndReturn({ data, skipDuplicates: true, select: { id: true, userId: true } }),

  createDeliveries: (tx: Tx, data: Prisma.NotificationDeliveryCreateManyInput[]) =>
    data.length ? tx.notificationDelivery.createMany({ data, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
};
