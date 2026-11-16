import type { NotificationItem, Paginated } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notify, renderMessage } from '../src/modules/notifications/notifications.service';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, type TestContext, type WorkspaceFixture } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const PASSWORD = 'Employee123';

/** Workspace with two plain users (Lao and English speakers). */
const setup = async () => {
  const ws = await createWorkspace(t.db);
  const lo = await createUser(t.db, ws, { email: 'lo@x.test', password: PASSWORD, role: 'EMPLOYEE' });
  const en = await createUser(t.db, ws, { email: 'en@x.test', password: PASSWORD, role: 'EMPLOYEE' });
  await t.db.tenant(ws.workspaceId, (tx) => tx.user.update({ where: { id: en.id }, data: { locale: 'en', phone: '02055550001', phoneVerifiedAt: new Date() } }));
  return { ws, lo, en };
};

const docExpiry = (ws: WorkspaceFixture, userIds: string[], dedupeKey?: string) =>
  t.db.tenant(ws.workspaceId, (tx) =>
    notify(tx, {
      workspaceId: ws.workspaceId,
      userIds,
      type: 'DOCUMENT_EXPIRY',
      titleKey: 'notif.docExpiring.title',
      bodyKey: 'notif.docExpiring.body',
      params: { document: { t: 'document.VISA' }, employee: 'Somchai K', days: 7, date: '2026-12-01' },
      link: '/employees/abc',
      dedupeKey,
    }),
  );

const session = async (ws: WorkspaceFixture, email: string) => (await loginAs(t.app, ws.code, email, PASSWORD)).accessToken;

describe('renderMessage', () => {
  it('interpolates params and translates { t } params per language', () => {
    expect(renderMessage('en', 'notif.docExpiring.body', { document: { t: 'document.VISA' }, employee: 'A B', days: 7, date: '2026-12-01' })).toBe(
      'Visa of A B expires in 7 days (2026-12-01)',
    );
    expect(renderMessage('lo', 'notif.docExpiring.body', { document: { t: 'document.VISA' }, employee: 'A B', days: 7, date: 'x' })).toContain('ວີຊາ');
  });
});

describe('notify()', () => {
  it('renders in each recipient language, de-duplicates per user and queues only available channels', async () => {
    const { ws, lo, en } = await setup();
    // SMS on for this workspace; only `en` has a phone. Only `lo` has a push token.
    await t.db.tenant(ws.workspaceId, async (tx) => {
      await tx.workspaceParameter.create({ data: { workspaceId: ws.workspaceId, key: 'notification.smsEnabled', value: true, effectiveFrom: new Date('2020-01-01') } });
      await tx.pushToken.create({ data: { workspaceId: ws.workspaceId, userId: lo.id, token: `ExponentPushToken[${ws.code}]`, platform: 'ANDROID' } });
    });

    expect(await docExpiry(ws, [lo.id, en.id, lo.id], 'doc-expiry:d1:7')).toEqual({ created: 2, deliveries: 2 });
    expect(await docExpiry(ws, [lo.id, en.id], 'doc-expiry:d1:7')).toEqual({ created: 0, deliveries: 0 });

    const rows = await t.db.tenant(ws.workspaceId, (tx) =>
      tx.notification.findMany({ where: { workspaceId: ws.workspaceId }, include: { deliveries: true } }),
    );
    const byUser = Object.fromEntries(rows.map((r) => [r.userId, r]));
    expect(byUser[en.id]!.title).toBe('Document expiring soon');
    expect(byUser[en.id]!.body).toBe('Visa of Somchai K expires in 7 days (2026-12-01)');
    expect(byUser[lo.id]!.title).toBe('ເອກະສານໃກ້ໝົດອາຍຸ');
    expect(byUser[lo.id]!.deliveries.map((d) => d.channel)).toEqual(['PUSH']);
    expect(byUser[en.id]!.deliveries.map((d) => d.channel)).toEqual(['SMS']);
    expect(byUser[lo.id]!.link).toBe('/employees/abc');
  });

  it('queues no SMS when the workspace keeps SMS disabled (default) and skips inactive users', async () => {
    const { ws, lo, en } = await setup();
    await t.db.tenant(ws.workspaceId, (tx) => tx.user.update({ where: { id: lo.id }, data: { isActive: false } }));
    expect(await docExpiry(ws, [lo.id, en.id])).toEqual({ created: 1, deliveries: 0 });
  });
});

describe('notification routes', () => {
  it('lists, filters, counts and marks the caller\'s own notifications only', async () => {
    const { ws, lo, en } = await setup();
    await docExpiry(ws, [lo.id, en.id], 'k1');
    await docExpiry(ws, [lo.id], 'k2');
    const loToken = await session(ws, 'lo@x.test');
    const enToken = await session(ws, 'en@x.test');

    const list = (await t.app.inject({ method: 'GET', url: api('/notifications'), headers: bearer(loToken) })).json<Paginated<NotificationItem>>();
    expect(list.total).toBe(2);
    expect(list.items[0]).toMatchObject({ type: 'DOCUMENT_EXPIRY', link: '/employees/abc', readAt: null });

    const count = () => t.app.inject({ method: 'GET', url: api('/notifications/unread-count'), headers: bearer(loToken) }).then((r) => r.json<{ count: number }>().count);
    expect(await count()).toBe(2);

    const enItem = (await t.app.inject({ method: 'GET', url: api('/notifications'), headers: bearer(enToken) })).json<Paginated<NotificationItem>>().items[0]!;
    // Someone else's notification: not found, untouched.
    expect((await t.app.inject({ method: 'POST', url: api(`/notifications/${enItem.id}/read`), headers: bearer(loToken) })).statusCode).toBe(404);

    const read = await t.app.inject({ method: 'POST', url: api(`/notifications/${list.items[0]!.id}/read`), headers: bearer(loToken) });
    expect(read.statusCode).toBe(200);
    expect(read.json<NotificationItem>().readAt).not.toBeNull();
    expect(await count()).toBe(1);

    const unread = (await t.app.inject({ method: 'GET', url: api('/notifications?unread=true'), headers: bearer(loToken) })).json<Paginated<NotificationItem>>();
    expect(unread.items.map((i) => i.id)).toEqual([list.items[1]!.id]);

    const all = await t.app.inject({ method: 'POST', url: api('/notifications/read-all'), headers: bearer(loToken) });
    expect(all.json()).toEqual({ updated: 1 });
    expect(await count()).toBe(0);
    // en's notification stays unread.
    expect((await t.app.inject({ method: 'GET', url: api('/notifications/unread-count'), headers: bearer(enToken) })).json()).toEqual({ count: 1 });
  });

  it('does not leak notifications across workspaces', async () => {
    const a = await setup();
    const b = await setup();
    await docExpiry(a.ws, [a.lo.id]);
    const aItem = (await t.app.inject({ method: 'GET', url: api('/notifications'), headers: bearer(await session(a.ws, 'lo@x.test')) })).json<Paginated<NotificationItem>>().items[0]!;
    const bToken = await session(b.ws, 'lo@x.test');
    expect((await t.app.inject({ method: 'GET', url: api('/notifications'), headers: bearer(bToken) })).json<Paginated<NotificationItem>>().total).toBe(0);
    expect((await t.app.inject({ method: 'POST', url: api(`/notifications/${aItem.id}/read`), headers: bearer(bToken) })).statusCode).toBe(404);
  });

  it('requires authentication', async () => {
    expect((await t.app.inject({ method: 'GET', url: api('/notifications') })).statusCode).toBe(401);
  });

  it('registers, moves and removes push tokens for the caller only', async () => {
    const { ws, lo, en } = await setup();
    const loToken = await session(ws, 'lo@x.test');
    const enToken = await session(ws, 'en@x.test');
    const token = `ExponentPushToken[${ws.code}-device]`;

    const reg = await t.app.inject({ method: 'POST', url: api('/me/push-tokens'), headers: bearer(loToken), payload: { token, platform: 'IOS' } });
    expect(reg.statusCode).toBe(201);
    expect(reg.json()).toMatchObject({ token, platform: 'IOS' });
    expect((await t.app.inject({ method: 'POST', url: api('/me/push-tokens'), headers: bearer(loToken), payload: { token: '', platform: 'IOS' } })).statusCode).toBe(400);

    // en cannot delete lo's token.
    expect((await t.app.inject({ method: 'DELETE', url: api(`/me/push-tokens/${encodeURIComponent(token)}`), headers: bearer(enToken) })).statusCode).toBe(204);
    const owner = () => t.db.tenant(ws.workspaceId, (tx) => tx.pushToken.findUnique({ where: { token } }).then((r) => r?.userId ?? null));
    expect(await owner()).toBe(lo.id);

    // Same device signs in as en: the token moves.
    await t.app.inject({ method: 'POST', url: api('/me/push-tokens'), headers: bearer(enToken), payload: { token, platform: 'IOS' } });
    expect(await owner()).toBe(en.id);

    expect((await t.app.inject({ method: 'DELETE', url: api(`/me/push-tokens/${encodeURIComponent(token)}`), headers: bearer(enToken) })).statusCode).toBe(204);
    expect(await owner()).toBeNull();
  });
});
