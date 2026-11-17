import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isoDateInTimeZone, type CheckinStatus, type DeviceInfo, type MyPunch, type PunchBatchResponse, type PunchItemInput } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseIsoDate } from '../src/lib/dates';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

/** Mobile check-in (FR-ATT-01/05–09/11.1/15/16.2, FR-NOTI-03.6) on PostgreSQL. */
let t: TestContext;
let storageDir: string;
beforeAll(async () => {
  storageDir = await mkdtemp(path.join(tmpdir(), 'hrm-checkin-'));
  t = await createTestContext({ FILE_STORAGE_DIR: storageDir });
});
afterAll(async () => {
  await t.close();
  await rm(storageDir, { recursive: true, force: true });
});

const PASSWORD = 'Person12345';
const BRANCH = { latitude: 17.9757, longitude: 102.6331, geofenceRadius: 150 };
/** ~1.1 km north of the branch. */
const FAR = { latitude: 17.9857, longitude: 102.6331 };
const PHONE_A = { deviceId: 'android-aaaa-1111', platform: 'ANDROID' as const, model: 'YAL-L21' };
const PHONE_B = { deviceId: 'android-bbbb-2222', platform: 'ANDROID' as const };
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(100)]);
const today = () => isoDateInTimeZone('Asia/Vientiane');

interface Person {
  employeeId: string;
  userId: string;
  email: string;
  token: string;
}

let seq = 0;
const setupWorkspace = async (modes: ('MOBILE' | 'SCANNER' | 'KIOSK')[] = ['MOBILE']) => {
  const ws = await createWorkspace(t.db);
  const branch = await t.db.tenant(ws.workspaceId, (tx) =>
    tx.branch.create({ data: { workspaceId: ws.workspaceId, name: `HQ ${++seq}`, ...BRANCH, attendanceModes: modes } }),
  );
  return { ws, branchId: branch.id };
};

/** Employee with a login; signs in with `device` when given (mobile login binds it). */
const person = async (
  ws: WorkspaceFixture,
  branchId: string | null,
  opts: { managerId?: string | null; role?: string; device?: DeviceInfo; status?: 'ACTIVE' | 'RESIGNED' } = {},
): Promise<Person> => {
  const n = ++seq;
  const emp = await t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: `C${n}`, firstName: 'ສົມ', lastName: `C${n}`, gender: 'MALE',
        hireDate: new Date('2024-01-01'), contractType: 'INDEFINITE', payType: 'MONTHLY', status: opts.status ?? 'ACTIVE',
        branchId, managerId: opts.managerId ?? null,
      },
    }),
  );
  const email = `c${n}@${ws.code}.test`;
  const user = await createUser(t.db, ws, { email, password: PASSWORD, role: opts.role ?? 'EMPLOYEE', employeeId: emp.id });
  const res = await t.app.inject({ method: 'POST', url: api('/auth/login'), payload: { workspaceCode: ws.code, identifier: email, password: PASSWORD, ...opts.device } });
  expect(res.statusCode).toBe(200);
  return { employeeId: emp.id, userId: user.id, email, token: res.json<{ accessToken: string }>().accessToken };
};

const item = (over: Partial<PunchItemInput> = {}): PunchItemInput => ({
  clientRef: randomUUID(),
  kind: 'IN',
  capturedAt: new Date().toISOString(),
  latitude: BRANCH.latitude + 0.0002,
  longitude: BRANCH.longitude,
  accuracyMetres: 12,
  mocked: false,
  offline: false,
  ...over,
});

const submit = async (token: string, items: PunchItemInput[], extra: Record<string, unknown> = {}) => {
  const res = await t.app.inject({
    method: 'POST',
    url: api('/attendance/punches'),
    headers: bearer(token),
    payload: { ...PHONE_A, deviceSentAt: new Date().toISOString(), items, ...extra },
  });
  return res;
};
const results = async (token: string, items: PunchItemInput[], extra: Record<string, unknown> = {}) => {
  const res = await submit(token, items, extra);
  expect(res.statusCode).toBe(200);
  return res.json<PunchBatchResponse>().results;
};
const status = async (token: string) => {
  const res = await t.app.inject({ method: 'GET', url: api('/attendance/me/status'), headers: bearer(token) });
  expect(res.statusCode).toBe(200);
  return res.json<CheckinStatus>();
};
const punchCount = (ws: WorkspaceFixture, employeeId: string) => t.db.tenant(ws.workspaceId, (tx) => tx.attendancePunch.count({ where: { employeeId } }));
const ownerUserId = (ws: WorkspaceFixture) => t.db.tenant(ws.workspaceId, async (tx) => (await tx.user.findFirstOrThrow({ where: { email: ws.ownerEmail } })).id);

describe('device binding (FR-ATT-11.1)', () => {
  it('binds the phone at the first mobile login and refuses punches from another phone', async () => {
    const { ws, branchId } = await setupWorkspace();
    const p = await person(ws, branchId, { device: PHONE_A });
    const bindings = await t.db.tenant(ws.workspaceId, (tx) => tx.deviceBinding.findMany({ where: { userId: p.userId } }));
    expect(bindings).toMatchObject([{ deviceId: PHONE_A.deviceId, platform: 'ANDROID', model: 'YAL-L21', isActive: true }]);

    // Signing in on a second phone still works, but does not move the binding.
    await t.app.inject({ method: 'POST', url: api('/auth/login'), payload: { workspaceCode: ws.code, identifier: p.email, password: PASSWORD, ...PHONE_B } });
    expect(await t.db.tenant(ws.workspaceId, (tx) => tx.deviceBinding.count({ where: { userId: p.userId, isActive: true } }))).toBe(1);

    const [r] = await results(p.token, [item()], PHONE_B);
    expect(r).toMatchObject({ result: 'rejected', error: 'device_not_bound' });
    expect(await punchCount(ws, p.employeeId)).toBe(0);
    expect((await status(p.token)).device).toMatchObject({ deviceId: PHONE_A.deviceId });
  });

  it('binds on the first punch when the login carried no device, and the web login never binds', async () => {
    const { ws, branchId } = await setupWorkspace();
    const p = await person(ws, branchId);
    expect((await status(p.token)).device).toBeNull();
    const [r] = await results(p.token, [item()]);
    expect(r!.result).toBe('created');
    expect((await status(p.token)).device).toMatchObject({ deviceId: PHONE_A.deviceId, platform: 'ANDROID' });
    const audit = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.count({ where: { action: 'attendance.device_bound', actorUserId: p.userId } }));
    expect(audit).toBe(1);
  });
});

describe('POST /attendance/punches', () => {
  it('creates an in-zone punch, replays the same clientRef idempotently and reports it in status and history', async () => {
    const { ws, branchId } = await setupWorkspace();
    const p = await person(ws, branchId, { device: PHONE_A });
    const punch = item({ offline: true, capturedAt: new Date(Date.now() - 60_000).toISOString() });

    const [first] = await results(p.token, [punch]);
    expect(first).toMatchObject({ clientRef: punch.clientRef, result: 'created', punch: { kind: 'IN', offline: true, reviewStatus: 'NONE', suspicious: false } });
    expect(first!.punch!.distanceMetres).toBeLessThan(BRANCH.geofenceRadius);

    // Network failed after the server stored it: the queue sends it again (and twice in one batch).
    const replay = await results(p.token, [punch, punch]);
    expect(replay.map((r) => r.result)).toEqual(['replayed', 'replayed']);
    expect(replay[0]!.punch!.id).toBe(first!.punch!.id);
    expect(await punchCount(ws, p.employeeId)).toBe(1);

    const s = await status(p.token);
    expect(s).toMatchObject({ mobileEnabled: true, selfieRequired: false, maxAccuracyMetres: 100, offlineAlertHours: 72, nextKind: 'OUT' });
    expect(s.branch).toMatchObject({ id: branchId, geofenceRadius: 150, attendanceModes: ['MOBILE'] });
    expect(s.lastPunch!.id).toBe(first!.punch!.id);

    const list = await t.app.inject({ method: 'GET', url: api(`/attendance/punches/me?from=${s.workDate}&to=${s.workDate}`), headers: bearer(p.token) });
    expect(list.statusCode).toBe(200);
    const mine = list.json<MyPunch[]>();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ offline: true, capturedAt: punch.capturedAt });
    expect(Date.parse(mine[0]!.receivedAt)).toBeGreaterThan(Date.parse(mine[0]!.capturedAt));
  });

  it('answers each item on its own: one bad item never fails the batch', async () => {
    const { ws, branchId } = await setupWorkspace();
    const p = await person(ws, branchId, { device: PHONE_A });
    const res = await results(p.token, [
      item({ kind: 'IN' }),
      item({ kind: 'OUT', latitude: FAR.latitude, longitude: FAR.longitude }),
      item({ kind: 'OUT', accuracyMetres: 500 }),
      item({ kind: 'OUT', latitude: null, longitude: null }),
    ]);
    expect(res.map((r) => r.result)).toEqual(['created', 'rejected', 'rejected', 'rejected']);
    expect(res[1]).toMatchObject({ error: 'attendance_outside_zone' });
    expect(res[1]!.distanceMetres).toBeGreaterThan(1000);
    expect(res[2]).toMatchObject({ error: 'attendance_low_accuracy' });
    expect(res[3]).toMatchObject({ error: 'attendance_location_required' });
    expect(await punchCount(ws, p.employeeId)).toBe(1);
  });

  it('refuses a mock (fake GPS) location and records it in the audit log (FR-ATT-09, NFR-06)', async () => {
    const { ws, branchId } = await setupWorkspace();
    const p = await person(ws, branchId, { device: PHONE_A });
    const [r] = await results(p.token, [item({ mocked: true })]);
    expect(r).toMatchObject({ result: 'rejected', error: 'attendance_mock_location' });
    expect(await punchCount(ws, p.employeeId)).toBe(0);
    const audit = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { action: 'attendance.mock_location' } }));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorUserId: p.userId, entityId: p.employeeId });
  });

  it('flags a device clock off by more than the tolerance as suspicious and notifies attendance reviewers (FR-ATT-07, FR-NOTI-03.6)', async () => {
    const { ws, branchId } = await setupWorkspace();
    const p = await person(ws, branchId, { device: PHONE_A });
    const skewed = new Date(Date.now() - 10 * 60_000).toISOString();
    const [r] = await results(p.token, [item({ capturedAt: skewed })], { deviceSentAt: skewed });
    expect(r).toMatchObject({ result: 'created', punch: { suspicious: true, suspiciousReasons: ['DEVICE_TIME_SKEW'], reviewStatus: 'PENDING' } });

    // Exactly at the tolerance is not suspicious ("> 5 minutes").
    const [ok] = await results(p.token, [item({ kind: 'OUT' })], { deviceSentAt: new Date(Date.now() - 4 * 60_000).toISOString() });
    expect(ok!.punch).toMatchObject({ suspicious: false, reviewStatus: 'NONE' });

    const owner = await ownerUserId(ws);
    const notes = await t.db.tenant(ws.workspaceId, (tx) => tx.notification.findMany({ where: { type: 'SUSPICIOUS_ATTENDANCE' } }));
    expect(notes.map((n) => n.userId)).toEqual([owner]);
    expect(notes[0]!.body).toContain('ເວລາໃນເຄື່ອງບໍ່ກົງກັບເຊີບເວີ');
    expect(await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.count({ where: { action: 'attendance.suspicious_punch' } }))).toBe(1);
  });

  it('marks a rooted device as suspicious', async () => {
    const { ws, branchId } = await setupWorkspace();
    const p = await person(ws, branchId, { device: PHONE_A });
    const [r] = await results(p.token, [item()], { rooted: true });
    expect(r!.punch).toMatchObject({ suspicious: true, suspiciousReasons: ['ROOTED'] });
  });

  it('refuses the branch without MOBILE mode and employees who left', async () => {
    const scanner = await setupWorkspace(['SCANNER']);
    const p = await person(scanner.ws, scanner.branchId, { device: PHONE_A });
    expect((await results(p.token, [item()]))[0]).toMatchObject({ result: 'rejected', error: 'attendance_mode_disabled' });
    expect((await status(p.token)).mobileEnabled).toBe(false);

    const noBranch = await person(scanner.ws, null, { device: PHONE_B });
    expect((await results(noBranch.token, [item()], PHONE_B))[0]).toMatchObject({ error: 'attendance_mode_disabled' });

    const mobile = await setupWorkspace();
    const left = await person(mobile.ws, mobile.branchId, { device: PHONE_A, status: 'RESIGNED' });
    expect((await results(left.token, [item()]))[0]).toMatchObject({ error: 'attendance_employee_inactive' });
  });

  it('requires a selfie the caller uploaded when attendance.selfieRequired is on', async () => {
    const { ws, branchId } = await setupWorkspace();
    const owner = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
    const set = await t.app.inject({
      method: 'POST',
      url: api('/settings/parameters'),
      headers: bearer(owner),
      payload: { key: 'attendance.selfieRequired', value: true, effectiveFrom: today(), reason: 'Selfie on' },
    });
    expect(set.statusCode).toBe(201);
    const p = await person(ws, branchId, { device: PHONE_A });
    const other = await person(ws, branchId, { device: PHONE_B });
    expect((await status(p.token)).selfieRequired).toBe(true);

    const upload = async (token: string) => {
      const boundary = `----hrm${randomBytes(8).toString('hex')}`;
      const payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="me.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
        JPG,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const res = await t.app.inject({
        method: 'POST',
        url: api('/files?purpose=SELFIE'),
        headers: { ...bearer(token), 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload,
      });
      expect(res.statusCode).toBe(201);
      return res.json<{ id: string }>().id;
    };

    expect((await results(p.token, [item()]))[0]).toMatchObject({ error: 'attendance_selfie_required' });
    const someoneElses = await upload(other.token);
    expect((await results(p.token, [item({ selfieFileId: someoneElses })]))[0]).toMatchObject({ error: 'attendance_selfie_invalid' });
    const mine = await upload(p.token);
    const [ok] = await results(p.token, [item({ selfieFileId: mine })]);
    expect(ok!.result).toBe('created');
    const stored = await t.db.tenant(ws.workspaceId, (tx) => tx.attendancePunch.findFirstOrThrow({ where: { id: ok!.punch!.id } }));
    expect(stored.selfieFileId).toBe(mine);
  });

  it('validates the body and needs an employee login', async () => {
    const { ws, branchId } = await setupWorkspace();
    const p = await person(ws, branchId, { device: PHONE_A });
    expect((await submit(p.token, [])).statusCode).toBe(400);
    expect((await submit(p.token, [item({ capturedAt: 'yesterday' })])).statusCode).toBe(400);
    expect((await submit(p.token, [item()], { platform: 'WEB' })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'POST', url: api('/attendance/punches'), payload: {} })).statusCode).toBe(401);

    const owner = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
    const res = await submit(owner, [item()]);
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('attendance_no_employee');
    expect((await t.app.inject({ method: 'GET', url: api('/attendance/punches/me?from=2026-01-01&to=2026-12-31'), headers: bearer(p.token) })).statusCode).toBe(400);
  });
});

describe('off-site check-in (FR-ATT-16.2/16.3)', () => {
  it('needs a permission and a reason, then waits for the manager; rejection removes it from the day', async () => {
    const { ws, branchId } = await setupWorkspace();
    const manager = await person(ws, branchId, { role: 'MANAGER', device: PHONE_B });
    const p = await person(ws, branchId, { managerId: manager.employeeId, device: PHONE_A });
    const far = { latitude: FAR.latitude, longitude: FAR.longitude };

    expect((await results(p.token, [item(far)]))[0]).toMatchObject({ error: 'attendance_outside_zone' });

    await t.db.tenant(ws.workspaceId, (tx) =>
      tx.offsitePermission.create({
        data: { workspaceId: ws.workspaceId, employeeId: p.employeeId, fromDate: parseIsoDate(today()), toDate: parseIsoDate(today()), note: 'Client visit' },
      }),
    );
    expect((await status(p.token)).offsitePermission).toMatchObject({ fromDate: today(), note: 'Client visit' });
    expect((await results(p.token, [item(far)]))[0]).toMatchObject({ error: 'attendance_offsite_reason_required' });

    const [r] = await results(p.token, [item({ ...far, offsiteReason: 'Meeting at the ministry' })]);
    expect(r).toMatchObject({ result: 'created', punch: { offsite: true, offsiteReason: 'Meeting at the ministry', reviewStatus: 'PENDING' } });

    const request = await t.db.tenant(ws.workspaceId, (tx) => tx.approvalRequest.findFirstOrThrow({ where: { subjectType: 'OFFSITE_CHECKIN', subjectId: r!.punch!.id } }));
    const inbox = await t.app.inject({ method: 'GET', url: api('/approvals/inbox'), headers: bearer(manager.token) });
    expect(inbox.statusCode).toBe(200);
    const items = inbox.json<{ items: { id: string; summary: { title: string; detail: string } }[] }>().items;
    const mine = items.find((i) => i.id === request.id);
    expect(mine?.summary.detail).toContain('Meeting at the ministry');

    const rejected = await t.app.inject({ method: 'POST', url: api(`/approvals/${request.id}/reject`), headers: bearer(manager.token), payload: { note: 'Not planned' } });
    expect(rejected.statusCode).toBe(200);
    const stored = await t.db.tenant(ws.workspaceId, (tx) => tx.attendancePunch.findFirstOrThrow({ where: { id: r!.punch!.id } }));
    expect(stored).toMatchObject({ reviewStatus: 'REJECTED', reviewedById: manager.userId, reviewNote: 'Not planned' });
    // The rejected punch no longer counts: nothing left to judge today.
    const day = await t.db.tenant(ws.workspaceId, (tx) => tx.attendanceDay.findFirst({ where: { employeeId: p.employeeId, firstInPunchId: stored.id } }));
    expect(day).toBeNull();
  });

  it('approval marks the punch APPROVED', async () => {
    const { ws, branchId } = await setupWorkspace();
    const manager = await person(ws, branchId, { role: 'MANAGER', device: PHONE_B });
    const p = await person(ws, branchId, { managerId: manager.employeeId, device: PHONE_A });
    await t.db.tenant(ws.workspaceId, (tx) =>
      tx.offsitePermission.create({ data: { workspaceId: ws.workspaceId, employeeId: p.employeeId, fromDate: parseIsoDate(today()), toDate: parseIsoDate(today()) } }),
    );
    const [r] = await results(p.token, [item({ ...FAR, offsiteReason: 'Site survey' })]);
    const request = await t.db.tenant(ws.workspaceId, (tx) => tx.approvalRequest.findFirstOrThrow({ where: { subjectId: r!.punch!.id } }));
    const res = await t.app.inject({ method: 'POST', url: api(`/approvals/${request.id}/approve`), headers: bearer(manager.token), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(await t.db.tenant(ws.workspaceId, (tx) => tx.attendancePunch.findFirstOrThrow({ where: { id: r!.punch!.id } }))).toMatchObject({ reviewStatus: 'APPROVED' });
  });
});

describe('data scope and tenant isolation', () => {
  it('lists only the caller’s own punches and keeps clientRefs per workspace', async () => {
    const a = await setupWorkspace();
    const b = await setupWorkspace();
    const pa = await person(a.ws, a.branchId, { device: PHONE_A });
    const pa2 = await person(a.ws, a.branchId, { device: PHONE_B });
    const pb = await person(b.ws, b.branchId, { device: PHONE_A });
    const shared = item();

    expect((await results(pa.token, [shared]))[0]!.result).toBe('created');
    // Same clientRef in another workspace is a different punch.
    expect((await results(pb.token, [shared]))[0]!.result).toBe('created');
    // Same clientRef from a colleague in the same workspace is not handed their punch.
    expect((await results(pa2.token, [shared], PHONE_B))[0]).toMatchObject({ result: 'rejected', error: 'conflict' });

    const day = today();
    const list = (token: string) => t.app.inject({ method: 'GET', url: api(`/attendance/punches/me?from=${day}&to=${day}`), headers: bearer(token) });
    expect((await list(pa2.token)).json<MyPunch[]>()).toHaveLength(0);
    const own = (await list(pb.token)).json<MyPunch[]>();
    expect(own).toHaveLength(1);
    expect(await punchCount(a.ws, pb.employeeId)).toBe(0);
  });
});
