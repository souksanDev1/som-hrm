import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { KioskDevice, KioskEnrolment, KioskInfo, KioskPunchBatchResponse, KioskPunchItemInput } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSecret } from '../src/lib/password';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

/** Kiosk mode (FR-ATT-03.1–03.3, FR-WS-06.3) on PostgreSQL. */
let t: TestContext;
let storageDir: string;
beforeAll(async () => {
  storageDir = await mkdtemp(path.join(tmpdir(), 'hrm-kiosk-'));
  t = await createTestContext({ FILE_STORAGE_DIR: storageDir });
});
afterAll(async () => {
  await t.close();
  await rm(storageDir, { recursive: true, force: true });
});

const PIN = '482913';
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(100)]);
const BRANCH = { latitude: 17.9757, longitude: 102.6331, geofenceRadius: 150 };

let seq = 0;

interface Setup {
  ws: WorkspaceFixture;
  ownerToken: string;
  branchId: string;
}

const setup = async (modes: ('MOBILE' | 'SCANNER' | 'KIOSK')[] = ['MOBILE', 'KIOSK']): Promise<Setup> => {
  const ws = await createWorkspace(t.db);
  const branch = await t.db.tenant(ws.workspaceId, (tx) =>
    tx.branch.create({ data: { workspaceId: ws.workspaceId, name: `Factory ${++seq}`, ...BRANCH, attendanceModes: modes } }),
  );
  const { accessToken } = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
  return { ws, ownerToken: accessToken, branchId: branch.id };
};

const addBranch = (ws: WorkspaceFixture, modes: ('MOBILE' | 'KIOSK')[] = ['KIOSK']) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.branch.create({ data: { workspaceId: ws.workspaceId, name: `Site ${++seq}`, attendanceModes: modes } }));

/** Employee with a PIN login (or none) at `branchId`. */
const worker = async (ws: WorkspaceFixture, branchId: string | null, opts: { pin?: string | null; status?: 'ACTIVE' | 'RESIGNED' } = {}) => {
  const n = ++seq;
  const emp = await t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: `K${n}`, firstName: 'ບຸນມີ', lastName: `K${n}`, gender: 'MALE',
        hireDate: new Date('2024-01-01'), contractType: 'INDEFINITE', payType: 'DAILY', status: opts.status ?? 'ACTIVE', branchId,
      },
    }),
  );
  const user = await createUser(t.db, ws, { email: `k${n}@${ws.code}.test`, password: 'Person12345', role: 'EMPLOYEE', employeeId: emp.id });
  const pin = opts.pin === undefined ? PIN : opts.pin;
  if (pin) await t.db.tenant(ws.workspaceId, async (tx) => tx.user.update({ where: { id: user.id }, data: { pinHash: await hashSecret(pin) } }));
  return { employeeId: emp.id, code: emp.employeeCode, userId: user.id, email: `k${n}@${ws.code}.test` };
};

const enrol = async (s: Setup, body: Record<string, unknown> = {}) => {
  const res = await t.app.inject({ method: 'POST', url: api('/kiosks'), headers: bearer(s.ownerToken), payload: { branchId: s.branchId, name: 'Front door', ...body } });
  expect(res.statusCode).toBe(201);
  return res.json<KioskEnrolment>();
};

const kioskAuth = (code: string) => ({ authorization: `Kiosk ${code}` });

const uploadPhoto = async (code: string) => {
  const boundary = `----hrm${randomBytes(8).toString('hex')}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="face.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    JPG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await t.app.inject({
    method: 'POST',
    url: api('/kiosk/files'),
    headers: { ...kioskAuth(code), 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string }>().id;
};

const item = (over: Partial<KioskPunchItemInput> & Pick<KioskPunchItemInput, 'employeeCode'>): KioskPunchItemInput => ({
  clientRef: randomUUID(),
  pin: PIN,
  capturedAt: new Date().toISOString(),
  ...over,
});

const punch = async (code: string, items: KioskPunchItemInput[], deviceSentAt = new Date().toISOString()) => {
  const res = await t.app.inject({ method: 'POST', url: api('/kiosk/punches'), headers: kioskAuth(code), payload: { deviceSentAt, items } });
  expect(res.statusCode).toBe(200);
  return res.json<KioskPunchBatchResponse>().results;
};

describe('kiosk management (FR-ATT-03.1, FR-WS-06.3)', () => {
  it('enrols a kiosk with a one-time code (hash stored), lists it and revokes it, with audit', async () => {
    const s = await setup();
    const { kiosk, enrolCode } = await enrol(s);
    expect(enrolCode.length).toBeGreaterThanOrEqual(43); // 32 random bytes, base64url
    expect(kiosk).toMatchObject({ name: 'Front door', branchId: s.branchId, enrolledByName: 'Owner', lastSeenAt: null, revokedAt: null });

    const row = await t.db.tenant(s.ws.workspaceId, (tx) => tx.kioskDevice.findUniqueOrThrow({ where: { id: kiosk.id } }));
    expect(row.tokenHash).not.toContain(enrolCode);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const list = await t.app.inject({ method: 'GET', url: api('/kiosks'), headers: bearer(s.ownerToken) });
    expect(list.json<KioskDevice[]>().map((k) => k.id)).toEqual([kiosk.id]);
    expect(JSON.stringify(list.json())).not.toContain(enrolCode);

    const revoke = await t.app.inject({ method: 'POST', url: api(`/kiosks/${kiosk.id}/revoke`), headers: bearer(s.ownerToken) });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json<KioskDevice>().revokedAt).not.toBeNull();
    const again = await t.app.inject({ method: 'POST', url: api(`/kiosks/${kiosk.id}/revoke`), headers: bearer(s.ownerToken) });
    expect(again.json()).toMatchObject({ error: { code: 'kiosk_already_revoked' } });

    expect((await t.app.inject({ method: 'GET', url: api('/kiosks'), headers: bearer(s.ownerToken) })).json()).toEqual([]);
    const withRevoked = await t.app.inject({ method: 'GET', url: api('/kiosks?includeRevoked=true'), headers: bearer(s.ownerToken) });
    expect(withRevoked.json<KioskDevice[]>()).toHaveLength(1);

    const audit = await t.db.tenant(s.ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { entity: 'KioskDevice' }, orderBy: { createdAt: 'asc' } }));
    expect(audit.map((a) => a.action)).toEqual(['kiosk.enrolled', 'kiosk.revoked']);
  });

  it('only enrols on an active branch with KIOSK mode, and validates the body', async () => {
    const s = await setup(['MOBILE']);
    const res = await t.app.inject({ method: 'POST', url: api('/kiosks'), headers: bearer(s.ownerToken), payload: { branchId: s.branchId, name: 'Tab' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'kiosk_mode_disabled' } });
    const missing = await t.app.inject({ method: 'POST', url: api('/kiosks'), headers: bearer(s.ownerToken), payload: { branchId: 'nope', name: 'Tab' } });
    expect(missing.statusCode).toBe(404);
    const blank = await t.app.inject({ method: 'POST', url: api('/kiosks'), headers: bearer(s.ownerToken), payload: { branchId: s.branchId, name: ' ' } });
    expect(blank.statusCode).toBe(400);
  });

  it('needs kiosk.manage and keeps workspaces apart', async () => {
    const s = await setup();
    const { kiosk } = await enrol(s);
    const w = await worker(s.ws, s.branchId);
    const { accessToken: employeeToken } = await loginAs(t.app, s.ws.code, w.email, 'Person12345');
    for (const req of [
      { method: 'GET' as const, url: api('/kiosks') },
      { method: 'POST' as const, url: api('/kiosks'), payload: { branchId: s.branchId, name: 'x' } },
      { method: 'POST' as const, url: api(`/kiosks/${kiosk.id}/revoke`) },
    ]) {
      expect((await t.app.inject({ ...req, headers: bearer(employeeToken) })).statusCode).toBe(403);
    }

    const other = await setup();
    expect((await t.app.inject({ method: 'GET', url: api('/kiosks'), headers: bearer(other.ownerToken) })).json()).toEqual([]);
    expect((await t.app.inject({ method: 'POST', url: api(`/kiosks/${kiosk.id}/revoke`), headers: bearer(other.ownerToken) })).statusCode).toBe(404);
    const foreignBranch = await t.app.inject({ method: 'POST', url: api('/kiosks'), headers: bearer(other.ownerToken), payload: { branchId: s.branchId, name: 'x' } });
    expect(foreignBranch.statusCode).toBe(404);
  });
});

describe('kiosk token auth', () => {
  it('authenticates with Authorization: Kiosk <code>, records last seen, and rejects unknown, revoked and user tokens', async () => {
    const s = await setup();
    const { kiosk, enrolCode } = await enrol(s);

    expect((await t.app.inject({ method: 'GET', url: api('/kiosk/me') })).statusCode).toBe(401);
    const unknown = await t.app.inject({ method: 'GET', url: api('/kiosk/me'), headers: kioskAuth(randomBytes(32).toString('base64url')) });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toMatchObject({ error: { code: 'kiosk_not_enrolled' } });
    // A user's JWT is not a kiosk credential, and a kiosk code is not a user credential.
    expect((await t.app.inject({ method: 'GET', url: api('/kiosk/me'), headers: bearer(s.ownerToken) })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: api('/kiosks'), headers: kioskAuth(enrolCode) })).statusCode).toBe(401);

    const me = await t.app.inject({ method: 'GET', url: api('/kiosk/me'), headers: kioskAuth(enrolCode) });
    expect(me.statusCode).toBe(200);
    expect(me.json<KioskInfo>()).toMatchObject({
      id: kiosk.id, name: 'Front door', branch: { id: s.branchId }, workspace: { name: `Test ${s.ws.code}`, logoUrl: null },
      timeZone: 'Asia/Vientiane', photoRequired: true, kioskEnabled: true, deviceTimeToleranceMinutes: 5, offlineAlertHours: 72,
    });
    const listed = (await t.app.inject({ method: 'GET', url: api('/kiosks'), headers: bearer(s.ownerToken) })).json<KioskDevice[]>();
    expect(listed[0]!.lastSeenAt).not.toBeNull();

    await t.app.inject({ method: 'POST', url: api(`/kiosks/${kiosk.id}/revoke`), headers: bearer(s.ownerToken) });
    const revoked = await t.app.inject({ method: 'GET', url: api('/kiosk/me'), headers: kioskAuth(enrolCode) });
    expect(revoked.statusCode).toBe(401);
    expect(revoked.json()).toMatchObject({ error: { code: 'kiosk_revoked' } });
  });
});

describe('POST /kiosk/punches (FR-ATT-03.2/03.3)', () => {
  it('punches with employee code + PIN + photo, infers IN then OUT, and records source KIOSK at the branch', async () => {
    const s = await setup();
    const { kiosk, enrolCode } = await enrol(s);
    const w = await worker(s.ws, s.branchId);

    const first = await punch(enrolCode, [item({ employeeCode: w.code.toLowerCase(), selfieFileId: await uploadPhoto(enrolCode) })]);
    expect(first[0]).toMatchObject({ result: 'created', employee: { code: w.code, name: `ບຸນມີ ${w.code}` }, punch: { kind: 'IN', source: 'KIOSK', suspicious: false } });
    const second = await punch(enrolCode, [item({ employeeCode: w.code, selfieFileId: await uploadPhoto(enrolCode), capturedAt: new Date(Date.now() + 1000).toISOString() })]);
    expect(second[0]).toMatchObject({ result: 'created', punch: { kind: 'OUT' } });

    const rows = await t.db.tenant(s.ws.workspaceId, (tx) => tx.attendancePunch.findMany({ where: { employeeId: w.employeeId }, orderBy: { capturedAt: 'asc' } }));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: 'KIOSK', kioskDeviceId: kiosk.id, branchId: s.branchId, latitude: BRANCH.latitude, longitude: BRANCH.longitude, deviceId: null });
    expect(rows[0]!.selfieFileId).toBeTruthy();
    // The day is recomputed by the shared punch path.
    expect(await t.db.tenant(s.ws.workspaceId, (tx) => tx.attendanceDay.count({ where: { employeeId: w.employeeId } }))).toBe(1);
    // A kiosk punch is not an employee device binding (client answer Q2).
    expect(await t.db.tenant(s.ws.workspaceId, (tx) => tx.deviceBinding.count({ where: { userId: w.userId } }))).toBe(0);

    // HR (attendance readers) can open the photo.
    const photo = await t.app.inject({ method: 'GET', url: api(`/files/${rows[0]!.selfieFileId}`), headers: bearer(s.ownerToken) });
    expect(photo.statusCode).toBe(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
  });

  it('always requires a photo uploaded by this kiosk, even with attendance.selfieRequired off', async () => {
    const s = await setup();
    const { enrolCode } = await enrol(s);
    const { enrolCode: otherKiosk } = await enrol(s, { name: 'Back door' });
    const w = await worker(s.ws, s.branchId);
    expect((await punch(enrolCode, [item({ employeeCode: w.code })]))[0]).toMatchObject({ result: 'rejected', error: 'attendance_selfie_required' });
    const foreign = await uploadPhoto(otherKiosk);
    expect((await punch(enrolCode, [item({ employeeCode: w.code, selfieFileId: foreign })]))[0]).toMatchObject({ error: 'attendance_selfie_invalid' });
    expect(await t.db.tenant(s.ws.workspaceId, (tx) => tx.attendancePunch.count())).toBe(0);
  });

  it('refuses a wrong PIN or unknown code alike, locks the employee after auth.lockout.maxAttempts and audits it', async () => {
    const s = await setup();
    const { enrolCode } = await enrol(s);
    const w = await worker(s.ws, s.branchId);
    const noPin = await worker(s.ws, s.branchId, { pin: null });
    const photo = await uploadPhoto(enrolCode);

    const unknown = await punch(enrolCode, [item({ employeeCode: 'NOPE1', selfieFileId: photo }), item({ employeeCode: noPin.code, selfieFileId: photo })]);
    expect(unknown.map((r) => r.error)).toEqual(['kiosk_invalid_credentials', 'kiosk_invalid_credentials']);

    const wrong = (n: number) => Array.from({ length: n }, () => item({ employeeCode: w.code, pin: '111111', selfieFileId: photo }));
    expect((await punch(enrolCode, wrong(4))).map((r) => r.error)).toEqual(Array(4).fill('kiosk_invalid_credentials'));
    expect((await punch(enrolCode, wrong(1)))[0]).toMatchObject({ error: 'account_locked' });
    // Locked: even the right PIN is refused, and the PIN sign-in is locked too (same account).
    expect((await punch(enrolCode, [item({ employeeCode: w.code, selfieFileId: photo })]))[0]).toMatchObject({ error: 'account_locked' });
    const login = await t.app.inject({ method: 'POST', url: api('/auth/login/pin'), payload: { workspaceCode: s.ws.code, identifier: w.code, pin: PIN } });
    expect(login.statusCode).toBe(423);

    const audit = await t.db.tenant(s.ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { entityId: w.userId, action: { startsWith: 'kiosk.' } } }));
    expect(audit.map((a) => a.action).sort()).toEqual([...Array(4).fill('kiosk.pin_failed'), 'kiosk.pin_locked'].sort());
    expect(await t.db.tenant(s.ws.workspaceId, (tx) => tx.attendancePunch.count())).toBe(0);
  });

  it('resets the failure counter after a right PIN', async () => {
    const s = await setup();
    const { enrolCode } = await enrol(s);
    const w = await worker(s.ws, s.branchId);
    const photo = await uploadPhoto(enrolCode);
    await punch(enrolCode, [item({ employeeCode: w.code, pin: '111111', selfieFileId: photo })]);
    expect((await punch(enrolCode, [item({ employeeCode: w.code, selfieFileId: photo })]))[0]!.result).toBe('created');
    const user = await t.db.tenant(s.ws.workspaceId, (tx) => tx.user.findUniqueOrThrow({ where: { id: w.userId } }));
    expect(user.failedAttempts).toBe(0);
  });

  it('refuses employees of another branch, employees who left, and a branch whose KIOSK mode was turned off', async () => {
    const s = await setup();
    const { enrolCode } = await enrol(s);
    const elsewhere = await addBranch(s.ws);
    const other = await worker(s.ws, elsewhere.id);
    const left = await worker(s.ws, s.branchId, { status: 'RESIGNED' });
    const w = await worker(s.ws, s.branchId);
    const photo = await uploadPhoto(enrolCode);
    const res = await punch(enrolCode, [item({ employeeCode: other.code, selfieFileId: photo }), item({ employeeCode: left.code, selfieFileId: photo })]);
    expect(res.map((r) => r.error)).toEqual(['kiosk_other_branch', 'attendance_employee_inactive']);

    await t.db.tenant(s.ws.workspaceId, (tx) => tx.branch.update({ where: { id: s.branchId }, data: { attendanceModes: ['MOBILE'] } }));
    expect((await punch(enrolCode, [item({ employeeCode: w.code, selfieFileId: photo })]))[0]).toMatchObject({ error: 'attendance_mode_disabled' });
    const me = await t.app.inject({ method: 'GET', url: api('/kiosk/me'), headers: kioskAuth(enrolCode) });
    expect(me.json<KioskInfo>().kioskEnabled).toBe(false);
  });

  it('replays an offline batch idempotently and refuses the same clientRef from another kiosk', async () => {
    const s = await setup();
    const { enrolCode } = await enrol(s);
    const { enrolCode: otherKiosk } = await enrol(s, { name: 'Back door' });
    const w = await worker(s.ws, s.branchId);
    const photo = await uploadPhoto(enrolCode);
    const base = Date.now() - 30 * 60_000;
    const batch = [
      item({ employeeCode: w.code, selfieFileId: photo, offline: true, capturedAt: new Date(base).toISOString() }),
      item({ employeeCode: w.code, selfieFileId: photo, offline: true, capturedAt: new Date(base + 60_000).toISOString() }),
    ];
    const first = await punch(enrolCode, batch);
    expect(first.map((r) => [r.result, r.punch?.kind, r.punch?.offline])).toEqual([
      ['created', 'IN', true],
      ['created', 'OUT', true],
    ]);
    const replay = await punch(enrolCode, [...batch, batch[0]!]);
    expect(replay.map((r) => r.result)).toEqual(['replayed', 'replayed', 'replayed']);
    expect(replay[0]!.punch!.id).toBe(first[0]!.punch!.id);
    expect(replay[0]!.employee).toMatchObject({ code: w.code });
    expect((await punch(otherKiosk, [batch[0]!]))[0]).toMatchObject({ result: 'rejected', error: 'conflict' });
    expect(await t.db.tenant(s.ws.workspaceId, (tx) => tx.attendancePunch.count({ where: { employeeId: w.employeeId } }))).toBe(2);
  });

  it('flags a tablet clock off by more than the tolerance as suspicious and notifies reviewers', async () => {
    const s = await setup();
    const { enrolCode } = await enrol(s);
    const w = await worker(s.ws, s.branchId);
    const photo = await uploadPhoto(enrolCode);
    const skewed = new Date(Date.now() - 10 * 60_000).toISOString();
    const [r] = await punch(enrolCode, [item({ employeeCode: w.code, selfieFileId: photo, capturedAt: skewed })], skewed);
    expect(r).toMatchObject({ result: 'created', punch: { suspicious: true, suspiciousReasons: ['DEVICE_TIME_SKEW'], reviewStatus: 'PENDING' } });
    const notes = await t.db.tenant(s.ws.workspaceId, (tx) => tx.notification.findMany({ where: { type: 'SUSPICIOUS_ATTENDANCE' } }));
    expect(notes).toHaveLength(1);
    const audit = await t.db.tenant(s.ws.workspaceId, (tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'attendance.suspicious_punch' } }));
    expect(audit.actorUserId).toBeNull();
    expect(audit.meta).toMatchObject({ kioskId: expect.any(String) });
  });

  it('validates the batch', async () => {
    const s = await setup();
    const { enrolCode } = await enrol(s);
    const bad = await t.app.inject({
      method: 'POST',
      url: api('/kiosk/punches'),
      headers: kioskAuth(enrolCode),
      payload: { deviceSentAt: new Date().toISOString(), items: [{ clientRef: 'short', employeeCode: 'E1', pin: '12', capturedAt: 'yesterday' }] },
    });
    expect(bad.statusCode).toBe(400);
  });
});
