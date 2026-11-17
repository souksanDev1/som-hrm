import { SMS_MAX_LENGTH } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { deliverPendingNotifications, RECEIPT_DELAY_MS, RECEIPT_TTL_MS, retryDelayMs } from '../src/jobs/handlers/notification-delivery';
import { runProbationEndingAlerts } from '../src/jobs/handlers/probation-ending';
import { createConsoleSmsSender } from '../src/lib/sms';
import { notify } from '../src/modules/notifications/notifications.service';
import { createExpoPushSender, EXPO_PUSH_URL, EXPO_RECEIPTS_URL, type PushReceipt } from '../src/modules/notifications/push';
import { createTestContext, createUser, createWorkspace, type TestContext, type WorkspaceFixture } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

/** 2026-11-16 09:00 in Vientiane (UTC+7). */
const NOW = new Date('2026-11-16T02:00:00Z');
const DAY = 86_400_000;
const isoDay = (offset: number, from = '2026-11-16') => new Date(Date.parse(`${from}T00:00:00Z`) + offset * DAY);

// ─────────────────────── Expo API mock (no network) ───────────────────────

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * Fake Expo push service. Tokens containing `gone` are unregistered, `busy` are rate limited;
 * every other token gets ticket `tk:<token>`. Receipts come from `receipts` (absent = not published yet).
 */
const fakeExpo = () => {
  const receipts: Record<string, PushReceipt | { status: 'error'; message: string; details: { error: string } }> = {};
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (String(url) === EXPO_PUSH_URL) {
      return json({
        data: (body as { to: string }[]).map(({ to }) =>
          to.includes('gone')
            ? { status: 'error', message: `"${to}" is not a registered push notification recipient`, details: { error: 'DeviceNotRegistered' } }
            : to.includes('busy')
              ? { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } }
              : { status: 'ok', id: `tk:${to}` },
        ),
      });
    }
    if (String(url) === EXPO_RECEIPTS_URL) {
      return json({ data: Object.fromEntries((body as { ids: string[] }).ids.filter((id) => receipts[id]).map((id) => [id, receipts[id]])) });
    }
    return json({ errors: [{ code: 'NOT_FOUND' }] }, 404);
  });
  return { fetchImpl, receipts, sender: createExpoPushSender({ accessToken: 'test-token', fetchImpl: fetchImpl as unknown as typeof fetch }) };
};

const sendCalls = (fetchImpl: ReturnType<typeof fakeExpo>['fetchImpl']) => fetchImpl.mock.calls.filter(([url]) => String(url) === EXPO_PUSH_URL);
const receiptCalls = (fetchImpl: ReturnType<typeof fakeExpo>['fetchImpl']) => fetchImpl.mock.calls.filter(([url]) => String(url) === EXPO_RECEIPTS_URL);

describe('Expo push sender', () => {
  it('batches messages 100 per request, keeps ticket order and authenticates', async () => {
    const { fetchImpl, sender } = fakeExpo();
    const messages = Array.from({ length: 250 }, (_, i) => ({ to: i === 120 ? `ExponentPushToken[gone-${i}]` : `ExponentPushToken[${i}]`, title: 'T', body: 'B', data: { link: '/x' } }));
    const tickets = await sender.send(messages);

    expect(sendCalls(fetchImpl).map(([, init]) => JSON.parse(String(init?.body)).length)).toEqual([100, 100, 50]);
    expect(tickets).toHaveLength(250);
    expect(tickets[0]).toEqual({ status: 'ok', id: 'tk:ExponentPushToken[0]' });
    expect(tickets[120]).toMatchObject({ status: 'error', error: 'DeviceNotRegistered' });
    expect(tickets[249]).toEqual({ status: 'ok', id: 'tk:ExponentPushToken[249]' });
    const [, init] = sendCalls(fetchImpl)[0]!;
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer test-token');
    expect(JSON.parse(String(init?.body))[0]).toMatchObject({ to: 'ExponentPushToken[0]', title: 'T', body: 'B', data: { link: '/x' }, sound: 'default' });
  });

  it('turns a failed batch into error tickets for that batch only', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ data: Array.from({ length: 100 }, (_, i) => ({ status: 'ok', id: `a${i}` })) }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json({ errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', message: 'x' }] }, 200));
    const sender = createExpoPushSender({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const tickets = await sender.send(Array.from({ length: 310 }, (_, i) => ({ to: `t${i}`, title: 'T', body: 'B' })));
    expect(tickets.slice(0, 100).every((x) => x.status === 'ok')).toBe(true);
    expect(tickets[100]).toEqual({ status: 'error', error: 'http_503' });
    expect(tickets[200]).toEqual({ status: 'error', error: 'network' });
    expect(tickets[300]).toEqual({ status: 'error', error: 'PUSH_TOO_MANY_EXPERIENCE_IDS' });
  });

  it('reads receipts 1000 ids per request and throws on transport errors', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const { ids } = JSON.parse(String(init?.body)) as { ids: string[] };
      return json({ data: Object.fromEntries(ids.map((id) => [id, id === 'r5' ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' }])) });
    });
    const sender = createExpoPushSender({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const receipts = await sender.getReceipts(Array.from({ length: 1500 }, (_, i) => `r${i}`));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]![0]).toBe(EXPO_RECEIPTS_URL);
    expect(Object.keys(receipts)).toHaveLength(1500);
    expect(receipts.r5).toEqual({ status: 'error', error: 'DeviceNotRegistered', message: 'gone' });
    expect(receipts.r6).toEqual({ status: 'ok' });

    fetchImpl.mockResolvedValueOnce(new Response('no', { status: 500 }));
    await expect(sender.getReceipts(['x'])).rejects.toThrow('http_500');
  });
});

// ─────────────────────── Fixtures ───────────────────────

const enableSms = (ws: WorkspaceFixture, value = true, effectiveFrom = new Date('2020-01-01')) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.workspaceParameter.create({ data: { workspaceId: ws.workspaceId, key: 'notification.smsEnabled', value, effectiveFrom } }));

const addToken = (ws: WorkspaceFixture, userId: string, token: string) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.pushToken.create({ data: { workspaceId: ws.workspaceId, userId, token, platform: 'ANDROID' } }));

const tokensOf = (ws: WorkspaceFixture) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.pushToken.findMany({ where: { workspaceId: ws.workspaceId }, orderBy: { token: 'asc' } })).then((r) => r.map((x) => x.token));

const deliveriesOf = (ws: WorkspaceFixture) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.notificationDelivery.findMany({ where: { workspaceId: ws.workspaceId }, include: { notification: { select: { userId: true } } } }));

const user = async (ws: WorkspaceFixture, email: string, data: { phone?: string; locale?: string } = {}) => {
  const u = await createUser(t.db, ws, { email, password: 'Employee123', role: 'EMPLOYEE' });
  if (Object.keys(data).length) await t.db.tenant(ws.workspaceId, (tx) => tx.user.update({ where: { id: u.id }, data }));
  return u;
};

const docAlert = (ws: WorkspaceFixture, userIds: string[], extra: { type?: 'DOCUMENT_EXPIRY' | 'APPROVAL_PENDING'; channels?: ('PUSH' | 'SMS')[]; dedupeKey?: string } = {}) =>
  t.db.tenant(ws.workspaceId, (tx) =>
    notify(tx, {
      workspaceId: ws.workspaceId,
      userIds,
      type: extra.type ?? 'DOCUMENT_EXPIRY',
      titleKey: 'notif.docExpiring.title',
      bodyKey: 'notif.docExpiring.body',
      params: { document: { t: 'document.WORK_PERMIT' }, employee: 'ສົມໃຈ ດວງດີ', days: 7, date: '2026-11-23' },
      link: '/employees/abc',
      dedupeKey: extra.dedupeKey,
      channels: extra.channels,
    }),
  );

// ─────────────────────── Push delivery ───────────────────────

describe('push delivery through Expo (FR-NOTI-01.1)', () => {
  it('sends every due delivery in one batched call and drops unregistered devices', async () => {
    const ws = await createWorkspace(t.db);
    const a = await user(ws, 'a@x.test');
    const b = await user(ws, 'b@x.test');
    await addToken(ws, a.id, `ExponentPushToken[${ws.code}-a1]`);
    await addToken(ws, a.id, `ExponentPushToken[${ws.code}-gone-a2]`);
    await addToken(ws, b.id, `ExponentPushToken[${ws.code}-gone-b]`);
    await docAlert(ws, [a.id, b.id]);

    const { fetchImpl, sender } = fakeExpo();
    const result = await deliverPendingNotifications({ db: t.db, push: sender, sms: createConsoleSmsSender(), maxAttempts: 3, now: () => NOW }, ws.workspaceId);
    expect(result).toMatchObject({ sent: 1, skipped: 1, retrying: 0, failed: 0, tokensRemoved: 2 });
    expect(sendCalls(fetchImpl)).toHaveLength(1);
    const payload = JSON.parse(String(sendCalls(fetchImpl)[0]![1]?.body)) as { to: string; data: { link: string; notificationId: string } }[];
    expect(payload).toHaveLength(3);
    expect(payload[0]!.data.link).toBe('/employees/abc');

    const rows = await deliveriesOf(ws);
    const ofA = rows.find((d) => d.notification.userId === a.id)!;
    expect(ofA).toMatchObject({ status: 'SENT', attempts: 1, receiptsCheckedAt: null });
    expect(ofA.pushTickets).toEqual([{ id: `tk:ExponentPushToken[${ws.code}-a1]`, token: `ExponentPushToken[${ws.code}-a1]` }]);
    expect(rows.find((d) => d.notification.userId === b.id)).toMatchObject({ status: 'SKIPPED', lastError: 'no_push_token' });
    expect(await tokensOf(ws)).toEqual([`ExponentPushToken[${ws.code}-a1]`]);
  });

  it('retries a rate-limited ticket with backoff through the outbox', async () => {
    const ws = await createWorkspace(t.db);
    const a = await user(ws, 'a@x.test');
    await addToken(ws, a.id, `ExponentPushToken[${ws.code}-busy]`);
    await docAlert(ws, [a.id]);
    const { sender } = fakeExpo();
    let clock = Date.now();
    const deps = { db: t.db, push: sender, sms: createConsoleSmsSender(), maxAttempts: 2, now: () => new Date(clock) };

    expect(await deliverPendingNotifications(deps, ws.workspaceId)).toMatchObject({ retrying: 1 });
    expect((await deliveriesOf(ws))[0]).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'MessageRateExceeded: slow down' });
    clock = Date.now() + retryDelayMs(1) + 1000;
    expect(await deliverPendingNotifications(deps, ws.workspaceId)).toMatchObject({ failed: 1 });
    expect((await deliveriesOf(ws))[0]).toMatchObject({ status: 'FAILED', attempts: 2 });
    expect(await tokensOf(ws)).toHaveLength(1); // rate limiting never removes the device
  });

  it('checks receipts after 15 minutes: unregistered devices are removed, failed sends are retried', async () => {
    const ws = await createWorkspace(t.db);
    const [gone, flaky, fine, late] = await Promise.all(['gone', 'flaky', 'fine', 'late'].map((n) => user(ws, `${n}@x.test`)));
    const token = (n: string) => `ExponentPushToken[${ws.code}-${n}]`;
    for (const [u, n] of [[gone, 'g'], [flaky, 'f'], [fine, 'ok'], [late, 'l']] as const) await addToken(ws, u!.id, token(n));
    await docAlert(ws, [gone!.id, flaky!.id, fine!.id, late!.id]);

    const { fetchImpl, receipts, sender } = fakeExpo();
    let clock = Date.now();
    const deps = { db: t.db, push: sender, sms: createConsoleSmsSender(), maxAttempts: 5, now: () => new Date(clock) };
    expect(await deliverPendingNotifications(deps, ws.workspaceId)).toMatchObject({ sent: 4, receiptsChecked: 0 });
    expect(receiptCalls(fetchImpl)).toHaveLength(0); // too early for receipts

    receipts[`tk:${token('g')}`] = { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } };
    receipts[`tk:${token('f')}`] = { status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } };
    receipts[`tk:${token('ok')}`] = { status: 'ok' };
    clock = Date.now() + RECEIPT_DELAY_MS + 1000;
    const second = await deliverPendingNotifications(deps, ws.workspaceId);
    expect(second).toMatchObject({ receiptsChecked: 3, tokensRemoved: 1, skipped: 1, retrying: 1 });
    expect(receiptCalls(fetchImpl)).toHaveLength(1);

    const byUser = async (id: string) => (await deliveriesOf(ws)).find((d) => d.notification.userId === id)!;
    expect(await byUser(gone!.id)).toMatchObject({ status: 'SKIPPED', lastError: 'no_push_token' });
    expect(await byUser(flaky!.id)).toMatchObject({ status: 'PENDING', attempts: 2, lastError: 'MessageRateExceeded: rate', pushTickets: null });
    expect((await byUser(fine!.id)).receiptsCheckedAt).not.toBeNull();
    expect((await byUser(late!.id)).receiptsCheckedAt).toBeNull(); // receipt not published yet
    expect(await tokensOf(ws)).not.toContain(token('g'));

    // The retried delivery is sent again once its backoff passed.
    clock = Date.now() + RECEIPT_DELAY_MS + retryDelayMs(2) + 2000;
    await deliverPendingNotifications(deps, ws.workspaceId);
    expect(await byUser(flaky!.id)).toMatchObject({ status: 'SENT', attempts: 3 });

    // A receipt that never shows up is given up after 24 hours.
    clock = Date.now() + RECEIPT_TTL_MS + 1000;
    await deliverPendingNotifications(deps, ws.workspaceId);
    expect((await byUser(late!.id)).receiptsCheckedAt).not.toBeNull();
  });
});

// ─────────────────────── SMS (FR-NOTI-02) ───────────────────────

describe('SMS fallback rules (FR-NOTI-02.2/02.3)', () => {
  it('queues SMS for key events only, to users with a phone and no app device, in their language within the length limit', async () => {
    const ws = await createWorkspace(t.db);
    await enableSms(ws);
    const noApp = await user(ws, 'noapp@x.test', { phone: '02055552001' });
    const noAppEn = await user(ws, 'noapp-en@x.test', { phone: '02055552002', locale: 'en' });
    const withApp = await user(ws, 'app@x.test', { phone: '02055552003' });
    const noPhone = await user(ws, 'nophone@x.test');
    await addToken(ws, withApp.id, `ExponentPushToken[${ws.code}-app]`);

    await docAlert(ws, [noApp.id, noAppEn.id, withApp.id, noPhone.id], { dedupeKey: 'k1' });
    const rows = await deliveriesOf(ws);
    const channels = (id: string) => rows.filter((d) => d.notification.userId === id).map((d) => d.channel).sort();
    expect(channels(noApp.id)).toEqual(['SMS']);
    expect(channels(noAppEn.id)).toEqual(['SMS']);
    expect(channels(withApp.id)).toEqual(['PUSH']);
    expect(channels(noPhone.id)).toEqual([]);

    const lo = rows.find((d) => d.notification.userId === noApp.id)!.message!;
    const en = rows.find((d) => d.notification.userId === noAppEn.id)!.message!;
    expect(lo).toBe('SOM HRM: ໃບອະນຸຍາດເຮັດວຽກ ຂອງ ສົມໃຈ ດວງດີ ຈະໝົດອາຍຸໃນ 7 ມື້ (ວັນທີ 2026-11-23)');
    expect(en).toBe('SOM HRM: Work permit of ສົມໃຈ ດວງດີ expires in 7 days (2026-11-23)');
    expect(Array.from(lo).length).toBeLessThanOrEqual(SMS_MAX_LENGTH);

    // Not a key event, or the caller asked for push only: no SMS.
    await docAlert(ws, [noApp.id], { type: 'APPROVAL_PENDING', dedupeKey: 'k2' });
    await docAlert(ws, [noApp.id], { channels: ['PUSH'], dedupeKey: 'k3' });
    expect(await deliveriesOf(ws)).toHaveLength(rows.length);
  });

  it('queues nothing while the workspace keeps SMS off (default)', async () => {
    const ws = await createWorkspace(t.db);
    const noApp = await user(ws, 'noapp@x.test', { phone: '02055552001' });
    expect(await docAlert(ws, [noApp.id])).toEqual({ created: 1, deliveries: 0 });
  });

  it('the delivery job sends the stored text and honours the toggle when it is switched off later', async () => {
    const ws = await createWorkspace(t.db);
    await enableSms(ws);
    const noApp = await user(ws, 'noapp@x.test', { phone: '02055552001', locale: 'en' });
    await docAlert(ws, [noApp.id], { dedupeKey: 'first' });
    const sms = createConsoleSmsSender();
    const deps = { db: t.db, push: fakeExpo().sender, sms, maxAttempts: 3, now: () => NOW };
    expect(await deliverPendingNotifications(deps, ws.workspaceId)).toMatchObject({ sent: 1 });
    expect(sms.outbox).toEqual([{ to: '02055552001', body: 'SOM HRM: Work permit of ສົມໃຈ ດວງດີ expires in 7 days (2026-11-23)' }]);

    // Queued while on, then HR turns SMS off from today: the pending SMS is skipped, not sent.
    await docAlert(ws, [noApp.id], { dedupeKey: 'second' });
    await enableSms(ws, false, new Date('2026-11-10'));
    expect(await deliverPendingNotifications(deps, ws.workspaceId)).toMatchObject({ sent: 0, skipped: 1 });
    expect(sms.outbox).toHaveLength(1);
    expect((await deliveriesOf(ws)).find((d) => d.status === 'SKIPPED')).toMatchObject({ channel: 'SMS', lastError: 'sms_disabled' });
  });
});

// ─────────────────────── Probation ending (FR-NOTI-03.5) ───────────────────────

const addEmployee = (ws: WorkspaceFixture, code: string, data: { probationEndDate?: Date | null; managerId?: string; status?: 'PROBATION' | 'ACTIVE' | 'RESIGNED' } = {}) =>
  t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: code, firstName: 'ສົມພອນ', lastName: code, gender: 'MALE', hireDate: new Date('2026-09-01'),
        contractType: 'PROBATION', payType: 'MONTHLY', status: data.status ?? 'PROBATION', probationEndDate: data.probationEndDate ?? null, managerId: data.managerId,
      },
    }),
  );

const probationRows = (ws: WorkspaceFixture) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.notification.findMany({ where: { workspaceId: ws.workspaceId, type: 'PROBATION_ENDING' }, orderBy: { createdAt: 'asc' } }));

describe('probation-ending alerts (FR-NOTI-03.5)', () => {
  /** HR owner + a manager with a login + employees ending at various offsets from 2026-11-16. */
  const setup = async () => {
    const ws = await createWorkspace(t.db);
    const owner = await t.db.tenant(ws.workspaceId, (tx) => tx.user.findFirstOrThrow({ where: { email: ws.ownerEmail } }));
    const boss = await addEmployee(ws, 'M01', { status: 'ACTIVE' });
    const bossUser = await createUser(t.db, ws, { email: 'boss@x.test', password: 'Passw0rd1', role: 'MANAGER', employeeId: boss.id });
    return { ws, owner, boss, bossUser };
  };

  it('alerts HR and the manager at 14 and 7 days by default, once per stage', async () => {
    const { ws, owner, boss, bossUser } = await setup();
    const in14 = await addEmployee(ws, 'P14', { probationEndDate: isoDay(14), managerId: boss.id });
    const in10 = await addEmployee(ws, 'P10', { probationEndDate: isoDay(10), managerId: boss.id });
    const today = await addEmployee(ws, 'P00', { probationEndDate: isoDay(0) });
    await addEmployee(ws, 'P15', { probationEndDate: isoDay(15), managerId: boss.id }); // beyond 14
    await addEmployee(ws, 'PPAST', { probationEndDate: isoDay(-1), managerId: boss.id }); // already ended
    await addEmployee(ws, 'PNONE', { probationEndDate: null, managerId: boss.id }); // contract PROBATION without a date: skipped
    await addEmployee(ws, 'PGONE', { probationEndDate: isoDay(5), managerId: boss.id, status: 'RESIGNED' });
    await addEmployee(ws, 'PDONE', { probationEndDate: isoDay(5), managerId: boss.id, status: 'ACTIVE' }); // confirmed early
    // The employee's own login is not alerted.
    await createUser(t.db, ws, { email: 'p14@x.test', password: 'Passw0rd1', role: 'EMPLOYEE', employeeId: in14.id });

    expect(await runProbationEndingAlerts(t.db, ws.workspaceId, NOW)).toEqual({ employees: 3, notifications: 5 });
    const rows = await probationRows(ws);
    const key = (r: (typeof rows)[number]) => `${r.userId === owner.id ? 'hr' : r.userId === bossUser.id ? 'mgr' : 'other'}:${r.dedupeKey}`;
    expect(rows.map(key).sort()).toEqual(
      [
        `hr:probation-end:${in14.id}:2026-11-30:14`, `mgr:probation-end:${in14.id}:2026-11-30:14`,
        `hr:probation-end:${in10.id}:2026-11-26:14`, `mgr:probation-end:${in10.id}:2026-11-26:14`,
        `hr:probation-end:${today.id}:2026-11-16:7`,
      ].sort(),
    );
    const hrRow = rows.find((r) => r.userId === owner.id && r.dedupeKey?.includes(in10.id))!;
    expect(hrRow).toMatchObject({ link: `/employees/${in10.id}`, title: 'ໃກ້ສິ້ນສຸດການທົດລອງວຽກ' });
    expect(hrRow.body).toBe(`ການທົດລອງວຽກຂອງ ສົມພອນ P10 ຈະສິ້ນສຸດໃນ 10 ມື້ (ວັນທີ 2026-11-26)`);

    // Same day again: nothing new.
    expect(await runProbationEndingAlerts(t.db, ws.workspaceId, NOW)).toEqual({ employees: 3, notifications: 0 });
    // Four days later: P10 (6 days left) enters the 7-day stage and P15 (11 days) the 14-day stage; P14 stays at 14.
    const later = await runProbationEndingAlerts(t.db, ws.workspaceId, new Date(NOW.getTime() + 4 * DAY));
    expect(later).toEqual({ employees: 3, notifications: 4 });
  });

  it('uses the workspace thresholds and a moved end date alerts again', async () => {
    const { ws, boss } = await setup();
    await t.db.tenant(ws.workspaceId, (tx) =>
      tx.workspaceParameter.create({ data: { workspaceId: ws.workspaceId, key: 'probation.alertDays', value: [30], effectiveFrom: new Date('2020-01-01') } }),
    );
    const emp = await addEmployee(ws, 'P25', { probationEndDate: isoDay(25), managerId: boss.id });
    expect((await runProbationEndingAlerts(t.db, ws.workspaceId, NOW)).notifications).toBe(2);
    await t.db.tenant(ws.workspaceId, (tx) => tx.employee.update({ where: { id: emp.id }, data: { probationEndDate: isoDay(28) } }));
    expect((await runProbationEndingAlerts(t.db, ws.workspaceId, NOW)).notifications).toBe(2);
  });

  it('counts days in the workspace timezone', async () => {
    const { ws } = await setup();
    await addEmployee(ws, 'PTZ', { probationEndDate: new Date('2026-12-01') });
    // 2026-11-16 18:00 UTC is already 2026-11-17 in Vientiane: 14 days left there, 15 in UTC.
    const lateEvening = new Date('2026-11-16T18:00:00Z');
    await t.db.system((tx) => tx.workspace.update({ where: { id: ws.workspaceId }, data: { timezone: 'UTC' } }));
    expect(await runProbationEndingAlerts(t.db, ws.workspaceId, lateEvening)).toEqual({ employees: 0, notifications: 0 });
    await t.db.system((tx) => tx.workspace.update({ where: { id: ws.workspaceId }, data: { timezone: 'Asia/Vientiane' } }));
    expect(await runProbationEndingAlerts(t.db, ws.workspaceId, lateEvening)).toEqual({ employees: 1, notifications: 1 });
    expect((await probationRows(ws))[0]!.body).toContain('14');
  });

  it('skips an inactive manager login and goes by SMS to a manager without the app when enabled', async () => {
    const { ws, boss, bossUser } = await setup();
    await enableSms(ws);
    await t.db.tenant(ws.workspaceId, (tx) => tx.user.update({ where: { id: bossUser.id }, data: { phone: '02055553001' } }));
    const emp = await addEmployee(ws, 'PSMS', { probationEndDate: isoDay(7), managerId: boss.id });
    await runProbationEndingAlerts(t.db, ws.workspaceId, NOW);
    const sms = (await deliveriesOf(ws)).filter((d) => d.channel === 'SMS');
    expect(sms).toHaveLength(1);
    expect(sms[0]!.notification.userId).toBe(bossUser.id);
    expect(sms[0]!.message).toContain('PSMS');

    await t.db.tenant(ws.workspaceId, (tx) => tx.user.update({ where: { id: bossUser.id }, data: { isActive: false } }));
    await t.db.tenant(ws.workspaceId, (tx) => tx.employee.update({ where: { id: emp.id }, data: { probationEndDate: isoDay(6) } }));
    await runProbationEndingAlerts(t.db, ws.workspaceId, NOW);
    expect((await probationRows(ws)).filter((r) => r.userId === bossUser.id)).toHaveLength(1);
  });
});

// ─────────────────────── Tenant isolation ───────────────────────

describe('tenant isolation of notification jobs', () => {
  it('a workspace job never reads or changes another workspace’s deliveries, tokens or employees', async () => {
    const a = await createWorkspace(t.db);
    const b = await createWorkspace(t.db);
    const ua = await user(a, 'u@x.test');
    const ub = await user(b, 'u@x.test');
    await addToken(a, ua.id, `ExponentPushToken[${a.code}-gone]`);
    await addToken(b, ub.id, `ExponentPushToken[${b.code}-gone]`);
    await docAlert(a, [ua.id]);
    await docAlert(b, [ub.id]);
    await addEmployee(b, 'PB', { probationEndDate: isoDay(7) });

    const { fetchImpl, sender } = fakeExpo();
    await deliverPendingNotifications({ db: t.db, push: sender, sms: createConsoleSmsSender(), maxAttempts: 3, now: () => NOW }, a.workspaceId);
    const sentTo = (JSON.parse(String(sendCalls(fetchImpl)[0]![1]?.body)) as { to: string }[]).map((m) => m.to);
    expect(sentTo).toEqual([`ExponentPushToken[${a.code}-gone]`]);
    expect(await tokensOf(b)).toHaveLength(1);
    expect((await deliveriesOf(b))[0]).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect(await runProbationEndingAlerts(t.db, a.workspaceId, NOW)).toEqual({ employees: 0, notifications: 0 });

    // RLS: even without a workspace filter a tenant transaction only sees its own outbox rows.
    const visible = await t.db.tenant(a.workspaceId, (tx) => tx.notificationDelivery.findMany({ select: { workspaceId: true } }));
    expect(new Set(visible.map((d) => d.workspaceId))).toEqual(new Set([a.workspaceId]));
    await expect(
      t.db.tenant(a.workspaceId, (tx) => tx.notificationDelivery.updateMany({ where: { workspaceId: b.workspaceId }, data: { status: 'FAILED' } })),
    ).resolves.toEqual({ count: 0 });
  });
});
