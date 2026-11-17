import { fitSmsText } from '@hrm/shared';
import { Prisma } from '@prisma/client';
import type { Db, Tx } from '../../db/client';
import type { SmsSender } from '../../lib/sms';
import { parameterReader } from '../../modules/parameters/parameters.service';
import { DEVICE_NOT_REGISTERED, type PushMessage, type PushSender, type PushTicket } from '../../modules/notifications/push';

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
  /** Push deliveries whose provider receipts were processed this run. */
  receiptsChecked: number;
  /** Push tokens removed because the provider reported the device as no longer registered. */
  tokensRemoved: number;
}

const BASE_RETRY_MS = 60_000;
const MAX_RETRY_MS = 60 * 60_000;
/** Expo publishes receipts within ~15 minutes of a send and keeps them for 24 hours. */
export const RECEIPT_DELAY_MS = 15 * 60_000;
export const RECEIPT_TTL_MS = 24 * 60 * 60_000;

/** Exponential backoff after `attempts` failed tries: 1 min, 2 min, 4 min … capped at 1 hour. */
export const retryDelayMs = (attempts: number): number => Math.min(BASE_RETRY_MS * 2 ** Math.max(0, attempts - 1), MAX_RETRY_MS);

/** Ticket ids of one push send, kept on the delivery to look up receipts. */
type StoredTicket = { id: string; token: string };

type Outcome =
  | { status: 'SENT'; tickets?: StoredTicket[] }
  | { status: 'SKIPPED'; reason: string }
  | { status: 'ERROR'; error: string };

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

/**
 * Outcome of one push delivery from the tickets of its device tokens: sent when any device accepted it;
 * skipped when every device is unregistered; otherwise an error that is retried with backoff.
 */
const pushOutcome = (tickets: { token: string; ticket: PushTicket }[]): Outcome => {
  const ok = tickets.flatMap(({ token, ticket }) => (ticket.status === 'ok' ? [{ id: ticket.id, token }] : []));
  if (ok.length) return { status: 'SENT', tickets: ok };
  const errors = tickets.flatMap(({ ticket }) => (ticket.status === 'error' ? [ticket] : []));
  const retryable = errors.find((e) => e.error !== DEVICE_NOT_REGISTERED);
  if (!retryable) return { status: 'SKIPPED', reason: 'no_push_token' };
  return { status: 'ERROR', error: retryable.message ? `${retryable.error}: ${retryable.message}`.slice(0, 500) : retryable.error };
};

/**
 * Send pending push/SMS deliveries of one workspace (FR-NOTI-04.5, FR-NOTI-01.1, FR-NOTI-02).
 *
 * - Push: every due delivery's device tokens go to the provider in one batched call (Expo: 100 per
 *   request). Unregistered devices (`DeviceNotRegistered`) lose their token. Later runs read the
 *   provider receipts of sent deliveries (see `checkPushReceipts`).
 * - SMS: sent only while the workspace keeps `notification.smsEnabled` on (FR-NOTI-02.3); otherwise SKIPPED.
 * - Each failure increments `attempts` and records `lastError`; the row is retried after an exponential
 *   backoff and marked FAILED once `maxAttempts` is reached. Provider calls happen outside transactions.
 */
export const deliverPendingNotifications = async (deps: DeliveryDeps, workspaceId: string): Promise<DeliveryRunResult> => {
  const now = deps.now?.() ?? new Date();
  const { pending, smsEnabled } = await deps.db.tenant(workspaceId, async (tx) => ({
    pending: await tx.notificationDelivery.findMany({
      where: { workspaceId, status: 'PENDING', attempts: { lt: deps.maxAttempts } },
      orderBy: { createdAt: 'asc' },
      take: deps.batchSize ?? 200,
      include: {
        notification: {
          select: { id: true, title: true, body: true, link: true, user: { select: { phone: true, pushTokens: { select: { token: true } } } } },
        },
      },
    }),
    smsEnabled: await parameterReader.workspace(tx, workspaceId, 'notification.smsEnabled', now),
  }));
  const due = pending.filter((d) => d.attempts === 0 || d.updatedAt.getTime() + retryDelayMs(d.attempts) <= now.getTime());
  const result: DeliveryRunResult = { sent: 0, retrying: 0, failed: 0, skipped: 0, receiptsChecked: 0, tokensRemoved: 0 };
  const outcomes = new Map<string, Outcome>();

  // ── SMS ──
  for (const d of due.filter((x) => x.channel === 'SMS')) {
    const n = d.notification;
    if (!smsEnabled) outcomes.set(d.id, { status: 'SKIPPED', reason: 'sms_disabled' });
    else if (!n.user.phone) outcomes.set(d.id, { status: 'SKIPPED', reason: 'no_phone' });
    else {
      try {
        await deps.sms.send({ to: n.user.phone, body: d.message ?? fitSmsText(`${n.title}: ${n.body}`) });
        outcomes.set(d.id, { status: 'SENT' });
      } catch (err) {
        outcomes.set(d.id, { status: 'ERROR', error: errorText(err) });
      }
    }
  }

  // ── Push: one batched provider call for all due deliveries ──
  const pushDue = due.filter((x) => x.channel === 'PUSH');
  const messages: (PushMessage & { deliveryId: string })[] = [];
  for (const d of pushDue) {
    const n = d.notification;
    if (deps.push.provider === 'none') outcomes.set(d.id, { status: 'SKIPPED', reason: 'push_disabled' });
    else if (n.user.pushTokens.length === 0) outcomes.set(d.id, { status: 'SKIPPED', reason: 'no_push_token' });
    else {
      for (const { token } of n.user.pushTokens) {
        messages.push({ deliveryId: d.id, to: token, title: n.title, body: n.body, data: { notificationId: n.id, link: n.link } });
      }
    }
  }
  if (messages.length) {
    let tickets: PushTicket[];
    try {
      tickets = await deps.push.send(messages.map(({ deliveryId: _, ...m }) => m));
    } catch (err) {
      tickets = messages.map(() => ({ status: 'error', error: errorText(err) }));
    }
    const byDelivery = new Map<string, { token: string; ticket: PushTicket }[]>();
    const gone: string[] = [];
    messages.forEach((m, i) => {
      const ticket: PushTicket = tickets[i] ?? { status: 'error', error: 'missing_ticket' };
      if (ticket.status === 'error' && ticket.error === DEVICE_NOT_REGISTERED) gone.push(m.to);
      byDelivery.set(m.deliveryId, [...(byDelivery.get(m.deliveryId) ?? []), { token: m.to, ticket }]);
    });
    for (const [deliveryId, list] of byDelivery) outcomes.set(deliveryId, pushOutcome(list));
    result.tokensRemoved += await removeTokens(deps.db, workspaceId, gone);
  }

  // ── Record outcomes ──
  for (const d of due) {
    const outcome = outcomes.get(d.id);
    if (!outcome) continue;
    const attempts = d.attempts + 1;
    await deps.db.tenant(workspaceId, (tx) => {
      switch (outcome.status) {
        case 'SENT':
          result.sent++;
          return tx.notificationDelivery.update({
            where: { id: d.id },
            data: {
              status: 'SENT', attempts, sentAt: now, lastError: null,
              pushTickets: outcome.tickets ?? Prisma.DbNull, receiptsCheckedAt: null,
            },
          });
        case 'SKIPPED':
          result.skipped++;
          return tx.notificationDelivery.update({ where: { id: d.id }, data: { status: 'SKIPPED', lastError: outcome.reason } });
        case 'ERROR':
          return recordFailure(tx, d.id, attempts, deps.maxAttempts, outcome.error, result);
      }
    });
  }

  result.receiptsChecked = await checkPushReceipts(deps, workspaceId, now, result);
  return result;
};

const recordFailure = (
  tx: Tx,
  id: string,
  attempts: number,
  maxAttempts: number,
  error: string,
  result: DeliveryRunResult,
) => {
  const failed = attempts >= maxAttempts;
  if (failed) result.failed++;
  else result.retrying++;
  return tx.notificationDelivery.update({
    where: { id },
    data: { status: failed ? 'FAILED' : 'PENDING', attempts, lastError: error, pushTickets: Prisma.DbNull, receiptsCheckedAt: null },
  });
};

const removeTokens = async (db: Db, workspaceId: string, tokens: string[]): Promise<number> => {
  if (!tokens.length) return 0;
  const { count } = await db.tenant(workspaceId, (tx) => tx.pushToken.deleteMany({ where: { workspaceId, token: { in: [...new Set(tokens)] } } }));
  return count;
};

/**
 * Read provider receipts of push deliveries sent at least `RECEIPT_DELAY_MS` ago (FR-NOTI-01.1).
 * - `DeviceNotRegistered` removes the token (the device is deactivated for push).
 * - A delivery none of whose devices got it is put back to PENDING with one more attempt, so the outbox
 *   retries it with backoff (or marks it FAILED at the limit); if every device is gone it is SKIPPED.
 * - Receipts not published yet are looked up again next run; after `RECEIPT_TTL_MS` they are given up.
 * Transport errors leave everything for the next run.
 */
const checkPushReceipts = async (deps: DeliveryDeps, workspaceId: string, now: Date, result: DeliveryRunResult): Promise<number> => {
  if (deps.push.provider === 'none') return 0;
  const sent = await deps.db.tenant(workspaceId, (tx) =>
    tx.notificationDelivery.findMany({
      where: {
        workspaceId, channel: 'PUSH', status: 'SENT', receiptsCheckedAt: null,
        pushTickets: { not: Prisma.DbNull }, sentAt: { lte: new Date(now.getTime() - RECEIPT_DELAY_MS) },
      },
      orderBy: { sentAt: 'asc' },
      take: deps.batchSize ?? 200,
      select: { id: true, attempts: true, sentAt: true, pushTickets: true },
    }),
  );
  if (!sent.length) return 0;
  const ticketsOf = (d: (typeof sent)[number]) => (Array.isArray(d.pushTickets) ? (d.pushTickets as unknown as StoredTicket[]) : []);

  let receipts: Awaited<ReturnType<PushSender['getReceipts']>>;
  try {
    receipts = await deps.push.getReceipts(sent.flatMap((d) => ticketsOf(d).map((t) => t.id)));
  } catch {
    return 0;
  }

  let checked = 0;
  const gone: string[] = [];
  for (const d of sent) {
    const tickets = ticketsOf(d);
    const found = tickets.filter((t) => receipts[t.id]);
    const expired = now.getTime() - (d.sentAt?.getTime() ?? 0) >= RECEIPT_TTL_MS;
    if (found.length < tickets.length && !expired) continue; // some receipts not published yet
    checked++;
    const errors = found.flatMap((t) => {
      const r = receipts[t.id]!;
      return r.status === 'error' ? [{ ...r, token: t.token }] : [];
    });
    gone.push(...errors.filter((e) => e.error === DEVICE_NOT_REGISTERED).map((e) => e.token));
    const delivered = found.length - errors.length > 0 || found.length < tickets.length;
    const retryable = errors.find((e) => e.error !== DEVICE_NOT_REGISTERED);
    await deps.db.tenant(workspaceId, (tx) => {
      if (delivered || errors.length === 0) {
        return tx.notificationDelivery.update({ where: { id: d.id }, data: { receiptsCheckedAt: now } });
      }
      if (!retryable) {
        result.skipped++;
        return tx.notificationDelivery.update({
          where: { id: d.id },
          data: { status: 'SKIPPED', lastError: 'no_push_token', receiptsCheckedAt: now },
        });
      }
      const error = retryable.message ? `${retryable.error}: ${retryable.message}` : retryable.error;
      return recordFailure(tx, d.id, d.attempts + 1, deps.maxAttempts, error.slice(0, 500), result);
    });
  }
  result.tokensRemoved += await removeTokens(deps.db, workspaceId, gone);
  return checked;
};
