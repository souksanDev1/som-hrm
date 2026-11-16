import type { Db } from '../../db/client';
import type { SmsSender } from '../../lib/sms';
import type { PushSender } from '../../modules/notifications/push';

export interface DeliveryDeps {
  db: Db;
  push: PushSender;
  sms: SmsSender;
  /** Attempts before a delivery is marked FAILED (env DELIVERY_MAX_ATTEMPTS). */
  maxAttempts: number;
  now?: () => Date;
  batchSize?: number;
}

export interface DeliveryRunResult {
  sent: number;
  retrying: number;
  failed: number;
  skipped: number;
}

const BASE_RETRY_MS = 60_000;
const MAX_RETRY_MS = 60 * 60_000;

/** Exponential backoff after `attempts` failed tries: 1 min, 2 min, 4 min … capped at 1 hour. */
export const retryDelayMs = (attempts: number): number => Math.min(BASE_RETRY_MS * 2 ** Math.max(0, attempts - 1), MAX_RETRY_MS);

type Outcome = { status: 'SENT' } | { status: 'SKIPPED'; reason: string } | { status: 'ERROR'; error: string };

/**
 * Send pending push/SMS deliveries of one workspace (FR-NOTI-04.5). Each failure increments
 * `attempts` and records `lastError`; the row is retried after an exponential backoff and marked
 * FAILED once `maxAttempts` is reached. Provider calls happen outside database transactions.
 */
export const deliverPendingNotifications = async (deps: DeliveryDeps, workspaceId: string): Promise<DeliveryRunResult> => {
  const now = deps.now?.() ?? new Date();
  const pending = await deps.db.tenant(workspaceId, (tx) =>
    tx.notificationDelivery.findMany({
      where: { workspaceId, status: 'PENDING', attempts: { lt: deps.maxAttempts } },
      orderBy: { createdAt: 'asc' },
      take: deps.batchSize ?? 200,
      include: {
        notification: {
          select: { id: true, title: true, body: true, link: true, user: { select: { phone: true, pushTokens: { select: { token: true } } } } },
        },
      },
    }),
  );
  const due = pending.filter((d) => d.attempts === 0 || d.updatedAt.getTime() + retryDelayMs(d.attempts) <= now.getTime());
  const result: DeliveryRunResult = { sent: 0, retrying: 0, failed: 0, skipped: 0 };

  for (const d of due) {
    const n = d.notification;
    const outcome = await attempt(async (): Promise<Outcome> => {
      if (d.channel === 'SMS') {
        if (!n.user.phone) return { status: 'SKIPPED', reason: 'no_phone' };
        await deps.sms.send({ to: n.user.phone, body: `${n.title}: ${n.body}` });
        return { status: 'SENT' };
      }
      if (deps.push.provider === 'none') return { status: 'SKIPPED', reason: 'push_disabled' };
      const tokens = n.user.pushTokens.map((t) => t.token);
      if (tokens.length === 0) return { status: 'SKIPPED', reason: 'no_push_token' };
      const { invalidTokens } = await deps.push.send({ tokens, title: n.title, body: n.body, data: { notificationId: n.id, link: n.link } });
      if (invalidTokens.length) {
        await deps.db.tenant(workspaceId, (tx) => tx.pushToken.deleteMany({ where: { workspaceId, token: { in: invalidTokens } } }));
      }
      return invalidTokens.length === tokens.length ? { status: 'SKIPPED', reason: 'no_push_token' } : { status: 'SENT' };
    });

    const attempts = d.attempts + 1;
    await deps.db.tenant(workspaceId, (tx) => {
      switch (outcome.status) {
        case 'SENT':
          result.sent++;
          return tx.notificationDelivery.update({ where: { id: d.id }, data: { status: 'SENT', attempts, sentAt: now, lastError: null } });
        case 'SKIPPED':
          result.skipped++;
          return tx.notificationDelivery.update({ where: { id: d.id }, data: { status: 'SKIPPED', lastError: outcome.reason } });
        case 'ERROR': {
          const failed = attempts >= deps.maxAttempts;
          if (failed) result.failed++;
          else result.retrying++;
          return tx.notificationDelivery.update({
            where: { id: d.id },
            data: { status: failed ? 'FAILED' : 'PENDING', attempts, lastError: outcome.error },
          });
        }
      }
    });
  }
  return result;
};

const attempt = async (fn: () => Promise<Outcome>): Promise<Outcome> => {
  try {
    return await fn();
  } catch (err) {
    return { status: 'ERROR', error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  }
};
