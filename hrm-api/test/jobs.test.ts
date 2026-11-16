import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fanOutToWorkspaces, listActiveWorkspaceIds } from '../src/jobs';
import { runAccountDeactivation } from '../src/jobs/handlers/account-deactivation';
import { runDocumentExpiryAlerts } from '../src/jobs/handlers/document-expiry';
import { deliverPendingNotifications, retryDelayMs } from '../src/jobs/handlers/notification-delivery';
import { createConsoleSmsSender } from '../src/lib/sms';
import { createExpoPushSender, createNoopPushSender, type PushSender } from '../src/modules/notifications/push';
import { createTestContext, createUser, createWorkspace, type TestContext, type WorkspaceFixture } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

/** 2026-11-16 09:00 in Vientiane (UTC+7). */
const NOW = new Date('2026-11-16T02:00:00Z');
const day = (offset: number) => new Date(Date.UTC(2026, 10, 16 + offset));

const createEmployee = (ws: WorkspaceFixture, code: string, status: 'ACTIVE' | 'RESIGNED' | 'TERMINATED' = 'ACTIVE') =>
  t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: code, firstName: 'Somchai', lastName: code, gender: 'MALE',
        hireDate: new Date('2024-01-01'), employmentType: 'FULL_TIME', status, nationalityType: 'FOREIGN', nationality: 'TH',
      },
    }),
  );

const addDocument = (ws: WorkspaceFixture, employeeId: string, expiresAt: Date, type: 'VISA' | 'WORK_PERMIT' = 'VISA') =>
  t.db.tenant(ws.workspaceId, (tx) => tx.employeeDocument.create({ data: { workspaceId: ws.workspaceId, employeeId, type, expiresAt } }));

const notificationsOf = (ws: WorkspaceFixture) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.notification.findMany({ where: { workspaceId: ws.workspaceId }, orderBy: { createdAt: 'asc' } }));

describe('document-expiry-alerts', () => {
  it('notifies HR and the employee once per default threshold (90/60/30/7) and when expired', async () => {
    const ws = await createWorkspace(t.db);
    const owner = await t.db.tenant(ws.workspaceId, (tx) => tx.user.findFirstOrThrow({ where: { email: ws.ownerEmail } }));
    const emp = await createEmployee(ws, 'F01');
    const empUser = await createUser(t.db, ws, { email: 'f01@x.test', password: 'Employee123', role: 'EMPLOYEE', employeeId: emp.id });
    const in7 = await addDocument(ws, emp.id, day(7));
    const in45 = await addDocument(ws, emp.id, day(45), 'WORK_PERMIT');
    const expired = await addDocument(ws, emp.id, day(-1));
    await addDocument(ws, emp.id, day(200)); // outside every threshold

    const first = await runDocumentExpiryAlerts(t.db, ws.workspaceId, NOW);
    expect(first).toEqual({ documents: 3, notifications: 6 });
    const rows = await notificationsOf(ws);
    const keys = rows.map((r) => `${r.userId === owner.id ? 'hr' : 'emp'}:${r.dedupeKey}`).sort();
    expect(keys).toEqual(
      [
        `emp:doc-expiry:${expired.id}:expired`, `emp:doc-expiry:${in45.id}:60`, `emp:doc-expiry:${in7.id}:7`,
        `hr:doc-expiry:${expired.id}:expired`, `hr:doc-expiry:${in45.id}:60`, `hr:doc-expiry:${in7.id}:7`,
      ].sort(),
    );
    const hrRow = rows.find((r) => r.userId === owner.id && r.dedupeKey === `doc-expiry:${in7.id}:7`)!;
    expect(hrRow.link).toBe(`/employees/${emp.id}`);
    expect(hrRow.body).toContain('7');
    expect(rows.find((r) => r.userId === empUser.id)!.link).toBe('/profile');

    // Re-running the same day is a no-op.
    expect(await runDocumentExpiryAlerts(t.db, ws.workspaceId, NOW)).toEqual({ documents: 3, notifications: 0 });
    // 16 days later the 45-day document crosses the 30-day threshold: one new alert each.
    const later = await runDocumentExpiryAlerts(t.db, ws.workspaceId, new Date(NOW.getTime() + 16 * 86_400_000));
    expect(later.notifications).toBe(4); // in45 → 30, in7 → expired (HR + employee each)
  });

  it('uses the workspace parameter thresholds and skips employees who left', async () => {
    const ws = await createWorkspace(t.db);
    await t.db.tenant(ws.workspaceId, (tx) =>
      tx.workspaceParameter.create({
        data: { workspaceId: ws.workspaceId, key: 'document.expiryAlertDays', value: [14, 3], effectiveFrom: new Date('2020-01-01') },
      }),
    );
    const emp = await createEmployee(ws, 'F02');
    const gone = await createEmployee(ws, 'F03', 'RESIGNED');
    const in10 = await addDocument(ws, emp.id, day(10));
    await addDocument(ws, emp.id, day(20)); // beyond 14
    await addDocument(ws, gone.id, day(2));

    expect(await runDocumentExpiryAlerts(t.db, ws.workspaceId, NOW)).toEqual({ documents: 1, notifications: 1 });
    expect((await notificationsOf(ws)).map((r) => r.dedupeKey)).toEqual([`doc-expiry:${in10.id}:14`]);
  });
});

describe('account-deactivation', () => {
  it('deactivates logins of resigned/terminated employees, revokes tokens, audits, and is idempotent', async () => {
    const ws = await createWorkspace(t.db);
    const left = await createEmployee(ws, 'L01', 'TERMINATED');
    const stays = await createEmployee(ws, 'L02', 'ACTIVE');
    const leftUser = await createUser(t.db, ws, { email: 'left@x.test', password: 'Employee123', role: 'EMPLOYEE', employeeId: left.id });
    const staysUser = await createUser(t.db, ws, { email: 'stays@x.test', password: 'Employee123', role: 'EMPLOYEE', employeeId: stays.id });
    await t.db.tenant(ws.workspaceId, (tx) =>
      tx.refreshToken.create({
        data: { workspaceId: ws.workspaceId, userId: leftUser.id, tokenHash: `h-${ws.code}`, familyId: 'f1', expiresAt: day(30) },
      }),
    );

    expect(await runAccountDeactivation(t.db, ws.workspaceId, NOW)).toEqual({ deactivated: 1 });
    expect(await runAccountDeactivation(t.db, ws.workspaceId, NOW)).toEqual({ deactivated: 0 });

    const users = await t.db.tenant(ws.workspaceId, (tx) => tx.user.findMany({ where: { id: { in: [leftUser.id, staysUser.id] } } }));
    expect(users.find((u) => u.id === leftUser.id)!.isActive).toBe(false);
    expect(users.find((u) => u.id === staysUser.id)!.isActive).toBe(true);
    const token = await t.db.tenant(ws.workspaceId, (tx) => tx.refreshToken.findFirstOrThrow({ where: { userId: leftUser.id } }));
    expect(token.revokedAt).not.toBeNull();
    const audits = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { action: 'user.deactivated', entityId: leftUser.id } }));
    expect(audits).toHaveLength(1);
  });
});

describe('notification-delivery', () => {
  /** A workspace user with a phone, a push token, SMS enabled, and one notification with PUSH + SMS deliveries. */
  const setupDeliveries = async () => {
    const ws = await createWorkspace(t.db);
    const user = await createUser(t.db, ws, { email: 'u@x.test', password: 'Employee123', role: 'EMPLOYEE' });
    await t.db.tenant(ws.workspaceId, async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { phone: '02055551111' } });
      await tx.pushToken.create({ data: { workspaceId: ws.workspaceId, userId: user.id, token: `ExponentPushToken[${ws.code}]`, platform: 'ANDROID' } });
      const n = await tx.notification.create({ data: { workspaceId: ws.workspaceId, userId: user.id, type: 'SYSTEM', title: 'T', body: 'B' } });
      await tx.notificationDelivery.createMany({
        data: [
          { workspaceId: ws.workspaceId, notificationId: n.id, channel: 'PUSH' },
          { workspaceId: ws.workspaceId, notificationId: n.id, channel: 'SMS' },
        ],
      });
    });
    const deliveries = () => t.db.tenant(ws.workspaceId, (tx) => tx.notificationDelivery.findMany({ where: { workspaceId: ws.workspaceId } }));
    const byChannel = async (c: 'PUSH' | 'SMS') => (await deliveries()).find((d) => d.channel === c)!;
    return { ws, byChannel };
  };

  it('sends SMS and push, and marks push SKIPPED when no provider is configured', async () => {
    const { ws, byChannel } = await setupDeliveries();
    const sms = createConsoleSmsSender();
    const result = await deliverPendingNotifications({ db: t.db, push: createNoopPushSender(), sms, maxAttempts: 3, now: () => NOW }, ws.workspaceId);
    expect(result).toEqual({ sent: 1, retrying: 0, failed: 0, skipped: 1 });
    expect(sms.outbox).toEqual([{ to: '02055551111', body: 'T: B' }]);
    expect(await byChannel('SMS')).toMatchObject({ status: 'SENT', attempts: 1 });
    expect(await byChannel('PUSH')).toMatchObject({ status: 'SKIPPED', lastError: 'push_disabled' });
  });

  it('retries failures with backoff and marks FAILED after the maximum attempts', async () => {
    const { ws, byChannel } = await setupDeliveries();
    const push: PushSender = { provider: 'expo', send: vi.fn().mockRejectedValue(new Error('expo_http_503')) };
    const sms = createConsoleSmsSender();
    let clock = NOW.getTime();
    const deps = { db: t.db, push, sms, maxAttempts: 3, now: () => new Date(clock) };

    expect((await deliverPendingNotifications(deps, ws.workspaceId)).retrying).toBe(1);
    expect(await byChannel('PUSH')).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'expo_http_503' });

    // Not due yet: backoff after one failure.
    clock = Date.now();
    expect(await deliverPendingNotifications(deps, ws.workspaceId)).toEqual({ sent: 0, retrying: 0, failed: 0, skipped: 0 });

    clock = Date.now() + retryDelayMs(1) + 1000;
    await deliverPendingNotifications(deps, ws.workspaceId);
    expect((await byChannel('PUSH')).attempts).toBe(2);
    clock = Date.now() + retryDelayMs(2) + 1000;
    expect((await deliverPendingNotifications(deps, ws.workspaceId)).failed).toBe(1);
    expect(await byChannel('PUSH')).toMatchObject({ status: 'FAILED', attempts: 3, lastError: 'expo_http_503' });
    expect(push.send).toHaveBeenCalledTimes(3);
  });

  it('expo sender posts tickets and reports unregistered tokens', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ status: 'ok' }, { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }] })),
    );
    const sender = createExpoPushSender({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await sender.send({ tokens: ['a', 'b'], title: 'T', body: 'B' });
    expect(res.invalidTokens).toEqual(['b']);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(JSON.parse((init as RequestInit).body as string)).toHaveLength(2);

    fetchImpl.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await expect(sender.send({ tokens: ['a'], title: 'T', body: 'B' })).rejects.toThrow('expo_http_500');
  });
});

describe('fan-out', () => {
  it('sends one job per ACTIVE workspace, keyed by workspace', async () => {
    const active = await createWorkspace(t.db);
    const suspended = await createWorkspace(t.db);
    await t.db.system((tx) => tx.workspace.update({ where: { id: suspended.workspaceId }, data: { status: 'SUSPENDED' } }));
    const ids = await listActiveWorkspaceIds(t.db);
    expect(ids).toContain(active.workspaceId);
    expect(ids).not.toContain(suspended.workspaceId);

    const send = vi.fn().mockResolvedValue('job-id');
    const count = await fanOutToWorkspaces(t.db, { send }, 'document-expiry-alerts');
    expect(count).toBe(ids.length);
    expect(send).toHaveBeenCalledWith('document-expiry-alerts', { workspaceId: active.workspaceId }, { singletonKey: active.workspaceId });
  });
});
