import {
  parseTimeOfDay,
  zonedInstant,
  type ApprovalInboxItem,
  type Correction,
  type DeviceChangeRequest,
  type EmployeeDevices,
  type OffsitePermission,
  type Paginated,
  type ReviewPunch,
} from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseIsoDate } from '../src/lib/dates';
import { createPunches, type NewPunch } from '../src/modules/attendance/punches';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

/** M5 agent D: review queue, punches on behalf, off-site permissions, device change and time corrections. */
let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const TZ = 'Asia/Vientiane';
const PASSWORD = 'Person12345';
/** A past Monday (standard 08:00–17:00 schedule). */
const DAY = '2026-11-09';
const at = (date: string, hhmm: string) => zonedInstant(date, parseTimeOfDay(hhmm)!, TZ);

interface Person {
  employeeId: string;
  userId: string;
  token: string;
}

let seq = 0;
const person = async (ws: WorkspaceFixture, managerId: string | null, role = 'EMPLOYEE'): Promise<Person> => {
  const n = ++seq;
  const emp = await t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: `D${n}`, firstName: 'ສົມ', lastName: `P${n}`, gender: 'MALE',
        hireDate: new Date('2024-01-01'), contractType: 'INDEFINITE', payType: 'MONTHLY', status: 'ACTIVE', managerId,
      },
    }),
  );
  const email = `d${n}@${ws.code}.test`;
  const user = await createUser(t.db, ws, { email, password: PASSWORD, role, employeeId: emp.id });
  return { employeeId: emp.id, userId: user.id, token: (await loginAs(t.app, ws.code, email, PASSWORD)).accessToken };
};

/** Owner (HR: every permission incl. approval.hr_fallback, no employee record) + a lead (MANAGER) with one worker. */
const team = async () => {
  const ws = await createWorkspace(t.db);
  const ownerToken = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
  const ownerUserId = (await t.db.tenant(ws.workspaceId, (tx) => tx.user.findFirstOrThrow({ where: { email: ws.ownerEmail } }))).id;
  const lead = await person(ws, null, 'MANAGER');
  const worker = await person(ws, lead.employeeId);
  const outsider = await person(ws, null);
  return { ws, ownerToken, ownerUserId, lead, worker, outsider };
};

const grant = async (ws: WorkspaceFixture, role: string, key: string) => {
  await t.db.system(async (tx) => {
    const permission = await tx.permission.findUniqueOrThrow({ where: { key } });
    await tx.rolePermission.create({ data: { workspaceId: ws.workspaceId, roleId: ws.roles[role]!, permissionId: permission.id } });
  });
};

const get = (token: string, path: string) => t.app.inject({ method: 'GET', url: api(path), headers: bearer(token) });
const post = (token: string, path: string, payload: Record<string, unknown> = {}) => t.app.inject({ method: 'POST', url: api(path), headers: bearer(token), payload });
const punch = (ws: WorkspaceFixture, punches: NewPunch[], now = at(DAY, '20:00')) => t.db.tenant(ws.workspaceId, (tx) => createPunches(tx, ws.workspaceId, punches, now));
const dayOf = (ws: WorkspaceFixture, employeeId: string, date = DAY) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.attendanceDay.findUnique({ where: { employeeId_workDate: { employeeId, workDate: parseIsoDate(date) } } }));
const audits = (ws: WorkspaceFixture, action: string) => t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { workspaceId: ws.workspaceId, action } }));
const inbox = async (token: string) => (await get(token, '/approvals/inbox')).json<Paginated<ApprovalInboxItem>>();

describe('suspicious-punch review (FR-ATT-14)', () => {
  const suspiciousDay = async () => {
    const team_ = await team();
    const { created } = await punch(team_.ws, [
      { employeeId: team_.worker.employeeId, kind: 'IN', capturedAt: at(DAY, '07:55'), source: 'MOBILE', suspicious: true, suspiciousReasons: ['DEVICE_TIME_SKEW'], reviewStatus: 'PENDING', latitude: 17.97, longitude: 102.6 },
      { employeeId: team_.worker.employeeId, kind: 'OUT', capturedAt: at(DAY, '17:05'), source: 'MOBILE' },
    ]);
    return { ...team_, punchId: created[0]!.id };
  };

  it('lists pending suspicious punches with workspace-local times and only for attendance.review holders', async () => {
    const { ownerToken, lead, worker, punchId } = await suspiciousDay();
    const res = await get(ownerToken, '/attendance/review');
    expect(res.statusCode).toBe(200);
    const body = res.json<Paginated<ReviewPunch>>();
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({ id: punchId, kind: 'IN', capturedLocal: `${DAY} 07:55`, suspiciousReasons: ['DEVICE_TIME_SKEW'], reviewStatus: 'PENDING', latitude: 17.97 });
    expect(body.items[0]!.employee.id).toBe(worker.employeeId);
    expect((await get(worker.token, '/attendance/review')).statusCode).toBe(403);
    expect((await get(lead.token, '/attendance/review')).statusCode).toBe(403);
  });

  it('rejecting needs a note, drops the punch from the day, is audited and cannot be decided twice', async () => {
    const { ws, ownerToken, worker, punchId } = await suspiciousDay();
    expect((await dayOf(ws, worker.employeeId))!.status).toBe('PRESENT');
    expect((await post(ownerToken, `/attendance/review/${punchId}`, { decision: 'REJECTED' })).statusCode).toBe(400);

    const res = await post(ownerToken, `/attendance/review/${punchId}`, { decision: 'REJECTED', note: 'clock tampered' });
    expect(res.statusCode).toBe(200);
    expect(res.json<ReviewPunch>()).toMatchObject({ reviewStatus: 'REJECTED', reviewNote: 'clock tampered' });
    expect((await dayOf(ws, worker.employeeId))!.status).toBe('MISSING_IN');
    expect(await audits(ws, 'attendance.review_reject')).toHaveLength(1);

    const again = await post(ownerToken, `/attendance/review/${punchId}`, { decision: 'APPROVED' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('review_already_decided');
    expect((await get(ownerToken, '/attendance/review')).json<Paginated<ReviewPunch>>().total).toBe(0);
  });

  it('approving keeps the punch counted; another workspace cannot see or decide it', async () => {
    const { ws, ownerToken, worker, punchId } = await suspiciousDay();
    const other = await createWorkspace(t.db);
    const otherToken = (await loginAs(t.app, other.code, other.ownerEmail, OWNER_PASSWORD)).accessToken;
    expect((await get(otherToken, '/attendance/review')).json<Paginated<ReviewPunch>>().total).toBe(0);
    expect((await post(otherToken, `/attendance/review/${punchId}`, { decision: 'APPROVED' })).statusCode).toBe(404);

    expect((await post(ownerToken, `/attendance/review/${punchId}`, { decision: 'APPROVED' })).json<ReviewPunch>().reviewStatus).toBe('APPROVED');
    expect((await dayOf(ws, worker.employeeId))!).toMatchObject({ status: 'PRESENT', firstInPunchId: punchId });
  });
});

describe('punch on behalf (FR-ATT-04)', () => {
  it('records an HR_ON_BEHALF punch with who and why, recomputes the day and audits it', async () => {
    const { ws, ownerToken, ownerUserId, worker } = await team();
    const res = await post(ownerToken, '/attendance/punches/on-behalf', { employeeId: worker.employeeId, kind: 'IN', capturedAt: `${DAY}T08:20`, reason: 'Phone broken' });
    expect(res.statusCode).toBe(201);
    const p = res.json<ReviewPunch>();
    expect(p).toMatchObject({ source: 'HR_ON_BEHALF', kind: 'IN', workDate: DAY, capturedLocal: `${DAY} 08:20`, reason: 'Phone broken' });
    expect(p.capturedAt).toBe(at(DAY, '08:20').toISOString());
    const row = await t.db.tenant(ws.workspaceId, (tx) => tx.attendancePunch.findUniqueOrThrow({ where: { id: p.id } }));
    expect(row.createdById).toBe(ownerUserId);
    expect((await dayOf(ws, worker.employeeId))!).toMatchObject({ lateMinutes: 20 });
    const [audit] = await audits(ws, 'attendance.punch_on_behalf');
    expect(audit).toMatchObject({ entityId: p.id, actorUserId: ownerUserId });
  });

  it('validates reason and time, needs the permission and stays inside the data scope', async () => {
    const { ws, ownerToken, lead, worker, outsider } = await team();
    const body = { employeeId: worker.employeeId, kind: 'OUT', capturedAt: `${DAY}T17:00`, reason: 'Forgot' };
    expect((await post(ownerToken, '/attendance/punches/on-behalf', { ...body, reason: '  ' })).statusCode).toBe(400);
    const future = await post(ownerToken, '/attendance/punches/on-behalf', { ...body, capturedAt: '2099-01-01T08:00' });
    expect(future.json().error.code).toBe('punch_in_future');
    expect((await post(ownerToken, '/attendance/punches/on-behalf', { ...body, capturedAt: `${DAY} 17:00` })).statusCode).toBe(400);
    expect((await post(worker.token, '/attendance/punches/on-behalf', body)).statusCode).toBe(403);

    // A manager given the permission may record only for their reporting tree.
    await grant(ws, 'MANAGER', 'attendance.punch_on_behalf');
    const leadToken = (await loginAs(t.app, ws.code, (await t.db.tenant(ws.workspaceId, (tx) => tx.user.findUniqueOrThrow({ where: { id: lead.userId } }))).email!, PASSWORD)).accessToken;
    expect((await post(leadToken, '/attendance/punches/on-behalf', body)).statusCode).toBe(201);
    expect((await post(leadToken, '/attendance/punches/on-behalf', { ...body, employeeId: outsider.employeeId })).statusCode).toBe(404);

    const other = await createWorkspace(t.db);
    const otherToken = (await loginAs(t.app, other.code, other.ownerEmail, OWNER_PASSWORD)).accessToken;
    expect((await post(otherToken, '/attendance/punches/on-behalf', body)).statusCode).toBe(404);
  });
});

describe('off-site permissions (FR-ATT-16.1)', () => {
  it('grants, lists, shows the employee their own, rejects overlaps and revokes once', async () => {
    const { ws, ownerToken, worker } = await team();
    const from = '2099-01-10';
    const res = await post(ownerToken, '/attendance/offsite-permissions', { employeeId: worker.employeeId, fromDate: from, toDate: '2099-01-20', note: 'Site visit' });
    expect(res.statusCode).toBe(201);
    const perm = res.json<OffsitePermission>();
    expect(perm).toMatchObject({ fromDate: from, toDate: '2099-01-20', note: 'Site visit', active: true, grantedBy: 'Owner' });
    expect((await audits(ws, 'attendance.offsite_grant'))).toHaveLength(1);

    const overlap = await post(ownerToken, '/attendance/offsite-permissions', { employeeId: worker.employeeId, fromDate: '2099-01-20', toDate: '2099-01-25' });
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json().error.code).toBe('offsite_overlap');
    expect((await post(ownerToken, '/attendance/offsite-permissions', { employeeId: worker.employeeId, fromDate: '2099-02-05', toDate: '2099-02-01' })).statusCode).toBe(400);
    expect((await post(ownerToken, '/attendance/offsite-permissions', { employeeId: worker.employeeId, fromDate: '2020-01-01', toDate: '2020-01-02' })).json().error.code).toBe('offsite_in_past');

    expect((await get(ownerToken, `/attendance/offsite-permissions?employeeId=${worker.employeeId}`)).json<Paginated<OffsitePermission>>().total).toBe(1);
    expect((await get(worker.token, '/attendance/offsite-permissions/me')).json<OffsitePermission[]>().map((p) => p.id)).toEqual([perm.id]);
    expect((await get(worker.token, '/attendance/offsite-permissions')).statusCode).toBe(403);
    expect((await post(worker.token, '/attendance/offsite-permissions', { employeeId: worker.employeeId, fromDate: from, toDate: from })).statusCode).toBe(403);

    const revoked = await post(ownerToken, `/attendance/offsite-permissions/${perm.id}/revoke`);
    expect(revoked.json<OffsitePermission>()).toMatchObject({ active: false });
    expect((await post(ownerToken, `/attendance/offsite-permissions/${perm.id}/revoke`)).json().error.code).toBe('offsite_already_revoked');
    expect((await get(ownerToken, '/attendance/offsite-permissions')).json<Paginated<OffsitePermission>>().total).toBe(0);
    expect((await get(ownerToken, '/attendance/offsite-permissions?includeInactive=true')).json<Paginated<OffsitePermission>>().total).toBe(1);
    expect(await get(worker.token, '/attendance/offsite-permissions/me').then((r) => r.json<OffsitePermission[]>())).toEqual([]);

    const other = await createWorkspace(t.db);
    const otherToken = (await loginAs(t.app, other.code, other.ownerEmail, OWNER_PASSWORD)).accessToken;
    expect((await post(otherToken, `/attendance/offsite-permissions/${perm.id}/revoke`)).statusCode).toBe(404);
    expect((await post(otherToken, '/attendance/offsite-permissions', { employeeId: worker.employeeId, fromDate: '2099-03-01', toDate: '2099-03-02' })).statusCode).toBe(404);
  });
});

describe('device change (FR-ATT-11.2/11.3)', () => {
  const bind = (ws: WorkspaceFixture, userId: string, deviceId: string) =>
    t.db.tenant(ws.workspaceId, (tx) => tx.deviceBinding.create({ data: { workspaceId: ws.workspaceId, userId, deviceId, platform: 'ANDROID', model: 'Old phone' } }));
  const bindings = (ws: WorkspaceFixture, userId: string) => t.db.tenant(ws.workspaceId, (tx) => tx.deviceBinding.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }));

  it('routes to HR (not the manager), and approval moves the single active binding to the new phone', async () => {
    const { ws, ownerToken, ownerUserId, lead, worker } = await team();
    const old = await bind(ws, worker.userId, 'old-device');
    const body = { deviceId: 'new-device', platform: 'ANDROID', model: 'Huawei Y7', reason: 'Lost my phone' };

    expect((await post(worker.token, '/attendance/device-change-requests', { ...body, deviceId: 'old-device' })).json().error.code).toBe('device_already_bound');
    const res = await post(worker.token, '/attendance/device-change-requests', body);
    expect(res.statusCode).toBe(201);
    const request = res.json<DeviceChangeRequest>();
    expect(request).toMatchObject({ status: 'PENDING', deviceId: 'new-device' });
    expect((await post(worker.token, '/attendance/device-change-requests', body)).json().error.code).toBe('device_change_pending');

    expect((await inbox(lead.token)).total).toBe(0);
    const hrBox = await inbox(ownerToken);
    expect(hrBox.items).toHaveLength(1);
    expect(hrBox.items[0]).toMatchObject({ id: request.approvalRequestId, subjectType: 'DEVICE_CHANGE', myCapacity: 'HR' });
    expect(hrBox.items[0]!.summary.title).toContain('Huawei Y7');
    expect((await post(lead.token, `/approvals/${request.approvalRequestId}/approve`)).statusCode).toBe(404);

    expect((await post(ownerToken, `/approvals/${request.approvalRequestId}/approve`)).statusCode).toBe(200);
    const [prev, next] = await bindings(ws, worker.userId);
    expect(prev).toMatchObject({ id: old.id, isActive: false, revokedById: ownerUserId });
    expect(prev!.revokedAt).not.toBeNull();
    expect(next).toMatchObject({ deviceId: 'new-device', isActive: true, model: 'Huawei Y7' });
    expect((await get(worker.token, '/attendance/device-change-requests/me')).json<DeviceChangeRequest[]>()[0]).toMatchObject({ status: 'APPROVED' });
  });

  it('rejection leaves the bindings alone; HR sees devices and resets the active one', async () => {
    const { ws, ownerToken, worker, lead } = await team();
    await bind(ws, worker.userId, 'only-device');
    const request = (await post(worker.token, '/attendance/device-change-requests', { deviceId: 'x', platform: 'IOS', reason: 'New phone' })).json<DeviceChangeRequest>();
    expect((await post(ownerToken, `/approvals/${request.approvalRequestId}/reject`, { note: 'Use the company phone' })).statusCode).toBe(200);
    expect((await bindings(ws, worker.userId)).map((b) => [b.deviceId, b.isActive])).toEqual([['only-device', true]]);

    const devices = (await get(ownerToken, `/attendance/devices?employeeId=${worker.employeeId}`)).json<EmployeeDevices>();
    expect(devices).toMatchObject({ hasLogin: true });
    expect(devices.bindings).toHaveLength(1);
    expect(devices.requests[0]).toMatchObject({ status: 'REJECTED', approvalRequestId: request.approvalRequestId });
    expect((await get(lead.token, `/attendance/devices?employeeId=${worker.employeeId}`)).statusCode).toBe(403);

    const reset = await post(ownerToken, `/attendance/devices/${devices.bindings[0]!.id}/reset`);
    expect(reset.json()).toMatchObject({ isActive: false });
    expect((await post(ownerToken, `/attendance/devices/${devices.bindings[0]!.id}/reset`)).json().error.code).toBe('device_binding_inactive');
    expect(await audits(ws, 'attendance.device_reset')).toHaveLength(1);

    const other = await createWorkspace(t.db);
    const otherToken = (await loginAs(t.app, other.code, other.ownerEmail, OWNER_PASSWORD)).accessToken;
    expect((await get(otherToken, `/attendance/devices?employeeId=${worker.employeeId}`)).statusCode).toBe(404);
  });

  it('needs an employee record to ask', async () => {
    const { ownerToken } = await team();
    expect((await post(ownerToken, '/attendance/device-change-requests', { deviceId: 'a', platform: 'IOS', reason: 'x' })).json().error.code).toBe('employee_required');
  });
});

describe('time correction (FR-ATT-19)', () => {
  const workedDay = async () => {
    const team_ = await team();
    const { created } = await punch(team_.ws, [
      { employeeId: team_.worker.employeeId, kind: 'IN', capturedAt: at(DAY, '08:30'), source: 'MOBILE' },
      { employeeId: team_.worker.employeeId, kind: 'OUT', capturedAt: at(DAY, '17:00'), source: 'MOBILE' },
    ]);
    return { ...team_, inId: created[0]!.id, outId: created[1]!.id };
  };

  it('routes to the manager with original vs requested, and approval adds a CORRECTION punch keeping the original', async () => {
    const { ws, ownerToken, lead, worker, inId } = await workedDay();
    expect((await dayOf(ws, worker.employeeId))!).toMatchObject({ status: 'LATE', lateMinutes: 30 });

    const res = await post(worker.token, '/attendance/corrections', { workDate: DAY, requestedCheckIn: '08:00', reason: 'Scanner queue' });
    expect(res.statusCode).toBe(201);
    const c = res.json<Correction>();
    expect(c).toMatchObject({ status: 'PENDING', workDate: DAY, checkIn: { original: `${DAY} 08:30`, requested: `${DAY} 08:00` }, checkOut: { original: null, requested: null } });
    expect((await post(worker.token, '/attendance/corrections', { workDate: DAY, requestedCheckOut: '17:30', reason: 'again' })).json().error.code).toBe('correction_pending_exists');

    // Routed along the chain (unchanged by the DEVICE_CHANGE HR routing), not to HR.
    expect((await inbox(ownerToken)).total).toBe(0);
    const box = await inbox(lead.token);
    expect(box.items[0]).toMatchObject({ id: c.approvalRequestId, subjectType: 'ATTENDANCE_CORRECTION', myCapacity: 'MANAGER' });
    expect(box.items[0]!.summary.title).toContain(DAY);
    expect(box.items[0]!.summary.detail).toContain('08:30 → 08:00');
    expect((await dayOf(ws, worker.employeeId))!.lateMinutes).toBe(30);

    expect((await post(lead.token, `/approvals/${c.approvalRequestId}/approve`)).statusCode).toBe(200);
    const punches = await t.db.tenant(ws.workspaceId, (tx) => tx.attendancePunch.findMany({ where: { employeeId: worker.employeeId, kind: 'IN' }, orderBy: { createdAt: 'asc' } }));
    expect(punches).toHaveLength(2);
    const [original, replacement] = punches;
    expect(replacement).toMatchObject({ source: 'CORRECTION', reason: 'Scanner queue', createdById: worker.userId });
    expect(replacement!.workDate.toISOString().slice(0, 10)).toBe(DAY);
    expect(original).toMatchObject({ id: inId, supersededById: replacement!.id });
    expect(original!.supersededAt).not.toBeNull();
    expect((await dayOf(ws, worker.employeeId))!).toMatchObject({ status: 'PRESENT', lateMinutes: 0, firstInPunchId: replacement!.id });
    expect((await get(worker.token, '/attendance/corrections/me')).json<Correction[]>()[0]).toMatchObject({ id: c.id, status: 'APPROVED' });
  });

  it('rejection changes nothing; a check-out not after the check-in is on the next day', async () => {
    const { ws, lead, worker, outId } = await workedDay();
    const c = (await post(worker.token, '/attendance/corrections', { workDate: DAY, requestedCheckIn: '22:00', requestedCheckOut: '06:00', reason: 'Night duty' })).json<Correction>();
    expect(c.checkOut).toEqual({ original: `${DAY} 17:00`, requested: '2026-11-10 06:00' });
    expect((await post(lead.token, `/approvals/${c.approvalRequestId}/reject`, { note: 'No night duty that day' })).statusCode).toBe(200);
    const out = await t.db.tenant(ws.workspaceId, (tx) => tx.attendancePunch.findUniqueOrThrow({ where: { id: outId } }));
    expect(out.supersededAt).toBeNull();
    expect(await t.db.tenant(ws.workspaceId, (tx) => tx.attendancePunch.count({ where: { employeeId: worker.employeeId } }))).toBe(2);
    expect((await get(worker.token, '/attendance/corrections/me')).json<Correction[]>()[0]!.status).toBe('REJECTED');
  });

  it('validates dates, times and the attachment owner; filing needs an employee record', async () => {
    const { ws, ownerToken, worker, lead } = await workedDay();
    const file = (uploadedById: string, purpose: 'ATTACHMENT' | 'SELFIE' = 'ATTACHMENT') =>
      t.db.tenant(ws.workspaceId, (tx) =>
        tx.storedFile.create({
          data: { workspaceId: ws.workspaceId, storageKey: `${ws.workspaceId}/${purpose}/${++seq}`, purpose, originalName: 'note.pdf', mimeType: 'application/pdf', sizeBytes: 10, sha256: 'x', uploadedById },
        }),
      );
    const post_ = (body: Record<string, unknown>) => post(worker.token, '/attendance/corrections', { workDate: DAY, reason: 'Forgot', ...body });

    expect((await post_({})).statusCode).toBe(400);
    expect((await post_({ requestedCheckIn: '8:00' })).statusCode).toBe(400);
    expect((await post_({ workDate: '2099-01-01', requestedCheckIn: '08:00' })).json().error.code).toBe('correction_future_date');
    expect((await post_({ attachmentFileId: (await file(lead.userId)).id, requestedCheckIn: '08:00' })).json().error.code).toBe('attachment_invalid');
    expect((await post_({ attachmentFileId: (await file(worker.userId, 'SELFIE')).id, requestedCheckIn: '08:00' })).json().error.code).toBe('attachment_invalid');

    const own = await file(worker.userId);
    const ok = await post_({ attachmentFileId: own.id, requestedCheckOut: '17:30' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json<Correction>().attachment).toMatchObject({ id: own.id, originalName: 'note.pdf' });
    expect((await post(ownerToken, '/attendance/corrections', { workDate: DAY, requestedCheckIn: '08:00', reason: 'x' })).json().error.code).toBe('employee_required');
    expect((await get(lead.token, '/attendance/corrections/me')).json<Correction[]>()).toEqual([]);
  });
});
