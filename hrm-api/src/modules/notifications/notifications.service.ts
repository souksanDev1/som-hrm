import {
  interpolate,
  translate,
  type Locale,
  type MessageParam,
  type NotificationChannel,
  type NotificationItem,
  type NotificationListQuery,
  type NotificationType,
  type Paginated,
  type RegisterPushTokenInput,
} from '@hrm/shared';
import type { Notification, Prisma } from '@prisma/client';
import type { Db, Tx } from '../../db/client';
import { notFound } from '../../lib/errors';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { parameterReader } from '../parameters/parameters.service';
import { notificationsRepository as repo } from './notifications.repository';

export interface NotifyInput {
  workspaceId: string;
  userIds: readonly string[];
  type: NotificationType;
  /** i18n keys of the title/body templates (rendered in each recipient's language). */
  titleKey: string;
  bodyKey: string;
  /** Template parameters; `{ t: key }` values are translated per recipient. */
  params?: Readonly<Record<string, MessageParam>>;
  /** In-app route to open, e.g. `/employees/abc`. */
  link?: string | null;
  /** Same key + user is only ever notified once (FR-NOTI-04.4). */
  dedupeKey?: string | null;
  data?: Prisma.InputJsonValue;
  /** Outbound channels to attempt besides in-app; defaults to all. Each is still subject to availability. */
  channels?: readonly NotificationChannel[];
}

export interface NotifyResult {
  /** Number of new in-app notifications (duplicates are skipped). */
  created: number;
  deliveries: number;
}

const toLocale = (value: string): Locale => (value === 'en' ? 'en' : 'lo');

/** Render a template in one language. */
export const renderMessage = (locale: Locale, key: string, params: Readonly<Record<string, MessageParam>> = {}): string =>
  interpolate(
    translate(locale, key),
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'object' ? translate(locale, v.t) : v])),
  );

/**
 * Create in-app notifications and queue their push/SMS deliveries, inside the caller's transaction.
 *
 * - Title/body are rendered in each recipient's `User.locale` (FR-WS-07).
 * - Duplicates of (workspace, user, dedupeKey) are skipped, never an error (FR-NOTI-04.4).
 * - A PUSH delivery is queued only for users with a registered push token; an SMS delivery only when
 *   the workspace enabled `notification.smsEnabled` and the user has a phone (FR-NOTI-02.3).
 * Inactive users are not notified. Deliveries are sent by the notification-delivery job.
 */
export const notify = async (tx: Tx, input: NotifyInput): Promise<NotifyResult> => {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return { created: 0, deliveries: 0 };
  const channels = input.channels ?? ['PUSH', 'SMS'];
  const recipients = await repo.findRecipients(tx, input.workspaceId, userIds);
  if (recipients.length === 0) return { created: 0, deliveries: 0 };

  const smsEnabled = channels.includes('SMS') && (await parameterReader.workspace(tx, input.workspaceId, 'notification.smsEnabled'));
  const params = input.params ?? {};
  const created = await repo.createMany(
    tx,
    recipients.map((r) => {
      const locale = toLocale(r.locale);
      return {
        workspaceId: input.workspaceId,
        userId: r.id,
        type: input.type,
        title: renderMessage(locale, input.titleKey, params),
        body: renderMessage(locale, input.bodyKey, params),
        link: input.link ?? null,
        dedupeKey: input.dedupeKey ?? null,
        data: input.data,
      };
    }),
  );

  const byUser = new Map(recipients.map((r) => [r.id, r]));
  const deliveries: Prisma.NotificationDeliveryCreateManyInput[] = created.flatMap(({ id, userId }) => {
    const r = byUser.get(userId)!;
    const rows: Prisma.NotificationDeliveryCreateManyInput[] = [];
    if (channels.includes('PUSH') && r._count.pushTokens > 0) rows.push({ workspaceId: input.workspaceId, notificationId: id, channel: 'PUSH' });
    if (smsEnabled && r.phone) rows.push({ workspaceId: input.workspaceId, notificationId: id, channel: 'SMS' });
    return rows;
  });
  await repo.createDeliveries(tx, deliveries);
  return { created: created.length, deliveries: deliveries.length };
};

const toItem = (n: Notification): NotificationItem => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

/** The signed-in user's own notification center (FR-NOTI-04.1/04.2) and push-token registry. */
export const createNotificationsService = (db: Db) => ({
  list: (ctx: AuthContext, q: NotificationListQuery): Promise<Paginated<NotificationItem>> =>
    db.tenant(ctx.workspaceId, async (tx) => {
      const { items, total } = await repo.list(tx, ctx.workspaceId, ctx.userId, q);
      return { items: items.map(toItem), total, page: q.page, pageSize: q.pageSize };
    }),

  unreadCount: (ctx: AuthContext) =>
    db.tenant(ctx.workspaceId, async (tx) => ({ count: await repo.countUnread(tx, ctx.workspaceId, ctx.userId) })),

  markRead: (ctx: AuthContext, id: string): Promise<NotificationItem> =>
    db.tenant(ctx.workspaceId, async (tx) => {
      const n = await repo.findOwn(tx, ctx.workspaceId, ctx.userId, id);
      if (!n) throw notFound();
      return toItem(n.readAt ? n : await repo.markRead(tx, n.id, new Date()));
    }),

  markAllRead: (ctx: AuthContext) =>
    db.tenant(ctx.workspaceId, async (tx) => ({ updated: (await repo.markAllRead(tx, ctx.workspaceId, ctx.userId, new Date())).count })),

  /**
   * Register this device's push token for the signed-in user. A token identifies one device, so it is
   * moved from whichever user (or company) registered it before — hence the system transaction.
   */
  registerPushToken: (ctx: AuthContext, input: RegisterPushTokenInput) =>
    db.system(async (tx) => {
      const existing = await tx.pushToken.findUnique({ where: { token: input.token } });
      if (existing && existing.userId === ctx.userId && existing.platform === input.platform) {
        return { token: existing.token, platform: existing.platform, createdAt: existing.createdAt.toISOString() };
      }
      if (existing) await tx.pushToken.delete({ where: { id: existing.id } });
      const row = await tx.pushToken.create({
        data: { workspaceId: ctx.workspaceId, userId: ctx.userId, token: input.token, platform: input.platform },
      });
      await auditRepository.create(tx, {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: 'user.push_token_registered',
        entity: 'User',
        entityId: ctx.userId,
        meta: { platform: input.platform },
      });
      return { token: row.token, platform: row.platform, createdAt: row.createdAt.toISOString() };
    }),

  /** Remove one of the caller's own push tokens (sign-out on a device). Idempotent. */
  removePushToken: (ctx: AuthContext, token: string) =>
    db.tenant(ctx.workspaceId, async (tx) => {
      await tx.pushToken.deleteMany({ where: { workspaceId: ctx.workspaceId, userId: ctx.userId, token } });
    }),
});

export type NotificationsService = ReturnType<typeof createNotificationsService>;
