import { randomBytes } from 'node:crypto';
import type { LeavePreview, LeaveRequest } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runLeaveCertificateDue } from '../src/jobs';
import { parseIsoDate } from '../src/lib/dates';
import { leaveLedger } from '../src/modules/leave/leave-ledger';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

/** Leave filing (FR-LV-03/05/06/09/10, FR-ORG-03.2) on PostgreSQL: preview, eligibility, certificate, proxy, delegate, scope, tenancy. */
let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const PASSWORD = 'Person12345';
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(100)]);

interface Person {
  employeeId: string;
  userId: string;
  token: string;
}

let seq = 0;
const person = async (
  ws: WorkspaceFixture,
  opts: { managerId?: string | null; role?: string; gender?: 'MALE' | 'FEMALE'; hireDate?: string; payType?: 'MONTHLY' | 'DAILY' } = {},
): Promise<Person> => {
  const n = ++seq;
  const emp = await t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: `LV${n}`, firstName: 'ສົມ', lastName: `L${n}`, gender: opts.gender ?? 'MALE',
        hireDate: parseIsoDate(opts.hireDate ?? '2024-01-01'), contractType: 'INDEFINITE', payType: opts.payType ?? 'MONTHLY', status: 'ACTIVE',
        managerId: opts.managerId ?? null,
      },
    }),
  );
  const email = `lv${n}@${ws.code}.test`;
  const user = await createUser(t.db, ws, { email, password: PASSWORD, role: opts.role ?? 'EMPLOYEE', employeeId: emp.id });
  return { employeeId: emp.id, userId: user.id, token: (await loginAs(t.app, ws.code, email, PASSWORD)).accessToken };
};

/** manager → worker (man) + woman; an outsider; HR without an employee record; leave types by code. */
const setup = async () => {
  const ws = await createWorkspace(t.db);
  const manager = await person(ws, { role: 'MANAGER' });
  const worker = await person(ws, { managerId: manager.employeeId });
  const woman = await person(ws, { managerId: manager.employeeId, gender: 'FEMALE' });
  const outsider = await person(ws);
  const hrEmail = `hr@${ws.code}.test`;
  const hrUser = await createUser(t.db, ws, { email: hrEmail, password: PASSWORD, role: 'HR_ADMIN' });
  const hr = { userId: hrUser.id, token: (await loginAs(t.app, ws.code, hrEmail, PASSWORD)).accessToken };
  const ownerToken = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
  const types = await t.db.tenant(ws.workspaceId, (tx) => tx.leaveType.findMany({ where: { workspaceId: ws.workspaceId }, select: { id: true, code: true } }));
  const type = (code: string) => types.find((x) => x.code === code)!.id;
  return { ws, manager, worker, woman, outsider, hr, ownerToken, type };
};

const grant = (ws: WorkspaceFixture, employeeId: string, leaveTypeId: string, year: number, days: number) =>
  t.db.tenant(ws.workspaceId, (tx) =>
    leaveLedger.post(tx, ws.workspaceId, { employeeId, leaveTypeId, periodYear: year, kind: 'ENTITLEMENT', days, effectiveDate: `${year}-01-01` }),
  );
const holiday = (ws: WorkspaceFixture, date: string) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.holiday.create({ data: { workspaceId: ws.workspaceId, date: parseIsoDate(date), nameLo: 'H', nameEn: 'H', kind: 'PUBLIC' } }));

const post = (token: string, path: string, payload: Record<string, unknown>) => t.app.inject({ method: 'POST', url: api(path), headers: bearer(token), payload });
const put = (token: string, path: string, payload: Record<string, unknown>) => t.app.inject({ method: 'PUT', url: api(path), headers: bearer(token), payload });
const get = (token: string, path: string) => t.app.inject({ method: 'GET', url: api(path), headers: bearer(token) });
const preview = async (token: string, body: Record<string, unknown>) => {
  const res = await post(token, '/leave/requests/preview', body);
  expect(res.statusCode).toBe(200);
  return res.json<LeavePreview>();
};
const file = async (token: string, body: Record<string, unknown>) => {
  const res = await post(token, '/leave/requests', body);
  expect(res.statusCode, res.body).toBe(201);
  return res.json<LeaveRequest>();
};
const upload = async (token: string) => {
  const boundary = `----hrm${randomBytes(8).toString('hex')}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cert.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    JPG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await t.app.inject({
    method: 'POST',
    url: api('/files?purpose=ATTACHMENT'),
    headers: { ...bearer(token), 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string }>().id;
};

describe('POST /leave/requests/preview — counting (FR-LV-03.3, FR-LV-04)', () => {
  it("counts the employee's working days: holidays and the weekly rest day are skipped, a half day is 0.5", async () => {
    const { ws, worker, type } = await setup();
    await grant(ws, worker.employeeId, type('ANNUAL'), 2030, 15);
    await holiday(ws, '2030-12-02');
    // Mon 2 Dec 2030 (holiday) – Sun 8 Dec (rest day) on the standard Mon–Sat schedule → Tue–Sat = 5 days.
    expect(await preview(worker.token, { leaveTypeId: type('ANNUAL'), startDate: '2030-12-02', endDate: '2030-12-08' })).toEqual({
      days: 5, byYear: { 2030: 5 }, balanceByYear: { 2030: 15 }, quota: null, errors: [], certificateRequired: false, certificateDueDate: null, needsDelegate: false,
    });
    expect(await preview(worker.token, { leaveTypeId: type('ANNUAL'), startDate: '2030-12-03', endDate: '2030-12-03', halfDay: 'AM' })).toMatchObject({ days: 0.5, errors: [] });
    expect((await preview(worker.token, { leaveTypeId: type('ANNUAL'), startDate: '2030-12-03', endDate: '2030-12-04', halfDay: 'PM' })).errors).toEqual([
      'leave_half_day_multi_day',
    ]);
    expect((await preview(worker.token, { leaveTypeId: type('MARRIAGE'), startDate: '2030-12-03', endDate: '2030-12-03', halfDay: 'PM' })).errors).toEqual([
      'leave_half_day_not_allowed',
    ]);
    expect((await preview(worker.token, { leaveTypeId: type('ANNUAL'), startDate: '2030-12-08', endDate: '2030-12-08' })).errors).toContain('leave_no_working_days');
  });

  it('follows an individual schedule override (rest on Monday)', async () => {
    const { ws, worker, ownerToken, type } = await setup();
    await grant(ws, worker.employeeId, type('ANNUAL'), 2030, 15);
    const override = await post(ownerToken, '/settings/work-schedule/overrides', {
      employeeIds: [worker.employeeId], dayHours: [8, 0, 8, 8, 8, 8, 8], effectiveFrom: '2030-11-01', reason: 'contract',
    });
    expect(override.statusCode).toBe(201);
    // Sun 8 – Tue 10 Dec 2030: Sunday works, Monday is the rest day → 2 days.
    expect(await preview(worker.token, { leaveTypeId: type('ANNUAL'), startDate: '2030-12-08', endDate: '2030-12-10' })).toMatchObject({ days: 2, byYear: { 2030: 2 } });
  });

  it('counts maternity leave in calendar days against the per-request quota (multiple birth: 120)', async () => {
    const { woman, type } = await setup();
    const maternity = type('MATERNITY');
    expect(await preview(woman.token, { leaveTypeId: maternity, startDate: '2030-12-01', endDate: '2031-03-15' })).toMatchObject({
      days: 105, byYear: { 2030: 31, 2031: 74 }, quota: 105, balanceByYear: null, errors: [],
    });
    expect((await preview(woman.token, { leaveTypeId: maternity, startDate: '2030-12-01', endDate: '2031-03-30' })).errors).toEqual(['leave_exceeds_quota']);
    expect(await preview(woman.token, { leaveTypeId: maternity, startDate: '2030-12-01', endDate: '2031-03-30', multipleBirth: true })).toMatchObject({
      days: 120, quota: 120, errors: [],
    });
  });
});

describe('eligibility (FR-LV-06)', () => {
  it('checks tenure, gender, the yearly balance minus other pending requests and the per-event quota', async () => {
    const { ws, worker, type } = await setup();
    const annual = type('ANNUAL');
    const newcomer = await person(ws, { hireDate: '2030-06-01' });
    await grant(ws, newcomer.employeeId, annual, 2030, 15);
    expect((await preview(newcomer.token, { leaveTypeId: annual, startDate: '2030-12-03', endDate: '2030-12-03' })).errors).toEqual(['leave_min_service']);
    // Sick leave's 90-day rule applies to daily / hourly staff only (Q15).
    const daily = await person(ws, { hireDate: '2030-11-01', payType: 'DAILY' });
    await grant(ws, daily.employeeId, type('SICK'), 2030, 30);
    expect((await preview(daily.token, { leaveTypeId: type('SICK'), startDate: '2030-12-03', endDate: '2030-12-03' })).errors).toEqual(['leave_min_service']);

    expect((await preview(worker.token, { leaveTypeId: type('MATERNITY'), startDate: '2030-12-03', endDate: '2030-12-03' })).errors).toEqual([
      'leave_gender_ineligible',
    ]);

    await grant(ws, worker.employeeId, annual, 2030, 15);
    // Mon 4 – Fri 15 Nov 2030 = 11 working days, pending.
    await file(worker.token, { leaveTypeId: annual, startDate: '2030-11-04', endDate: '2030-11-15' });
    const short = await preview(worker.token, { leaveTypeId: annual, startDate: '2030-12-02', endDate: '2030-12-06' });
    expect(short).toMatchObject({ days: 5, balanceByYear: { 2030: 4 }, errors: ['leave_insufficient_balance'] });
    const refused = await post(worker.token, '/leave/requests', { leaveTypeId: annual, startDate: '2030-12-02', endDate: '2030-12-06' });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toMatchObject({ code: 'leave_insufficient_balance', details: { errors: ['leave_insufficient_balance'] } });
    expect((await preview(worker.token, { leaveTypeId: annual, startDate: '2030-11-08', endDate: '2030-11-08' })).errors).toContain('leave_overlaps_request');

    // Bereavement: 3 days per request (client Q11), no yearly balance needed.
    expect(await preview(worker.token, { leaveTypeId: type('BEREAVEMENT'), startDate: '2030-12-02', endDate: '2030-12-04' })).toMatchObject({ days: 3, quota: 3, errors: [] });
    expect((await preview(worker.token, { leaveTypeId: type('BEREAVEMENT'), startDate: '2030-12-02', endDate: '2030-12-05' })).errors).toEqual(['leave_exceeds_quota']);
  });
});

describe('medical certificate (FR-LV-05)', () => {
  it('requires a certificate over the threshold, due 3 working days after the leave, attachable later', async () => {
    const { ws, worker, outsider, type } = await setup();
    const sick = type('SICK');
    await grant(ws, worker.employeeId, sick, 2030, 30);
    expect(await preview(worker.token, { leaveTypeId: sick, startDate: '2030-12-03', endDate: '2030-12-03' })).toMatchObject({ certificateRequired: false, certificateDueDate: null });
    // Tue 3 – Wed 4 Dec: due Thu 5, Fri 6 (holiday), Sat 7, Sun rest → Mon 9.
    await holiday(ws, '2030-12-06');
    expect(await preview(worker.token, { leaveTypeId: sick, startDate: '2030-12-03', endDate: '2030-12-04' })).toMatchObject({
      days: 2, certificateRequired: true, certificateDueDate: '2030-12-09',
    });
    const req = await file(worker.token, { leaveTypeId: sick, startDate: '2030-12-03', endDate: '2030-12-04', reason: 'Flu' });
    expect(req).toMatchObject({ certificateRequired: true, certificateFileId: null, certificateDueDate: '2030-12-09', status: 'PENDING', filedAs: 'SELF', days: 2 });

    // Reminder job: once while due after the leave ended, once more when overdue; re-runs add nothing.
    const notifs = () => t.db.tenant(ws.workspaceId, (tx) => tx.notification.findMany({ where: { userId: worker.userId, type: 'LEAVE_CERTIFICATE_DUE' } }));
    expect(await runLeaveCertificateDue(t.db, ws.workspaceId, new Date('2030-12-04T03:00:00Z'))).toEqual({ requests: 0, notifications: 0 });
    expect(await runLeaveCertificateDue(t.db, ws.workspaceId, new Date('2030-12-05T03:00:00Z'))).toEqual({ requests: 1, notifications: 1 });
    expect(await runLeaveCertificateDue(t.db, ws.workspaceId, new Date('2030-12-06T03:00:00Z'))).toEqual({ requests: 1, notifications: 0 });
    expect(await runLeaveCertificateDue(t.db, ws.workspaceId, new Date('2030-12-10T03:00:00Z'))).toEqual({ requests: 1, notifications: 1 });
    const sent = await notifs();
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ link: `/leave/${req.id}` });
    expect(sent.map((n) => n.dedupeKey).sort()).toEqual([`leave-cert:${req.id}:due`, `leave-cert:${req.id}:overdue`]);

    const someoneElses = await upload(outsider.token);
    const bad = await put(worker.token, `/leave/requests/${req.id}/certificate`, { fileId: someoneElses });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('leave_certificate_invalid');
    expect((await put(outsider.token, `/leave/requests/${req.id}/certificate`, { fileId: someoneElses })).statusCode).toBe(404);
    const mine = await upload(worker.token);
    const attached = await put(worker.token, `/leave/requests/${req.id}/certificate`, { fileId: mine });
    expect(attached.statusCode).toBe(200);
    expect(attached.json<LeaveRequest>().certificateFileId).toBe(mine);
    expect(await runLeaveCertificateDue(t.db, ws.workspaceId, new Date('2030-12-11T03:00:00Z'))).toEqual({ requests: 0, notifications: 0 });
    const audit = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findFirst({ where: { action: 'leave.certificate.attached', entityId: req.id } }));
    expect(audit?.meta).toMatchObject({ old: null, new: mine });
  });

  it('makes the certificate mandatory at filing once its deadline has passed', async () => {
    const { ws, worker, outsider, type } = await setup();
    const sick = type('SICK');
    await grant(ws, worker.employeeId, sick, 2026, 30);
    // Tue 10 – Wed 11 Feb 2026 is long past: due Sat 14 Feb.
    const body = { leaveTypeId: sick, startDate: '2026-02-10', endDate: '2026-02-11' };
    const missing = await post(worker.token, '/leave/requests', body);
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toMatchObject({ code: 'leave_certificate_required', details: { certificateDueDate: '2026-02-14' } });
    const foreign = await post(worker.token, '/leave/requests', { ...body, certificateFileId: await upload(outsider.token) });
    expect(foreign.json().error.code).toBe('leave_certificate_invalid');
    const ok = await file(worker.token, { ...body, certificateFileId: await upload(worker.token) });
    expect(ok.certificateFileId).not.toBeNull();
  });
});

describe('filing, approval routing and delegate (FR-LV-09, FR-ORG-03.2)', () => {
  it("routes the request to the employee's manager and audits it", async () => {
    const { ws, worker, manager, type } = await setup();
    await grant(ws, worker.employeeId, type('ANNUAL'), 2030, 15);
    const req = await file(worker.token, { leaveTypeId: type('ANNUAL'), startDate: '2030-12-03', endDate: '2030-12-04', reason: 'Trip' });
    expect(req).toMatchObject({ employeeId: worker.employeeId, days: 2, status: 'PENDING', filedAs: 'SELF', certificateRequired: false, cancelRequest: null });
    expect(req.approvalRequestId).toBeTruthy();
    const steps = await t.db.tenant(ws.workspaceId, (tx) => tx.approvalStep.findMany({ where: { requestId: req.approvalRequestId! } }));
    expect(steps).toEqual([expect.objectContaining({ level: 1, approverUserId: manager.userId, decision: 'PENDING' })]);
    const audit = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findFirst({ where: { action: 'leave.requested', entityId: req.id } }));
    expect(audit).toMatchObject({ actorUserId: worker.userId, meta: expect.objectContaining({ filedAs: 'SELF', days: 2 }) });
    // Approver sees the detail.
    expect((await get(manager.token, `/leave/requests/${req.id}`)).statusCode).toBe(200);
  });

  it('asks a manager for a delegate and creates the delegation for the absence', async () => {
    const { ws, manager, hr, type } = await setup();
    await grant(ws, manager.employeeId, type('ANNUAL'), 2030, 15);
    const body = { leaveTypeId: type('ANNUAL'), startDate: '2030-12-03', endDate: '2030-12-05' };
    expect((await preview(manager.token, body)).needsDelegate).toBe(true);
    const missing = await post(manager.token, '/leave/requests', body);
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('delegate_required');
    expect((await post(manager.token, '/leave/requests', { ...body, delegateUserId: manager.userId })).json().error.code).toBe('delegation_self');

    const req = await file(manager.token, { ...body, delegateUserId: hr.userId });
    const row = await t.db.tenant(ws.workspaceId, (tx) => tx.leaveRequest.findUniqueOrThrow({ where: { id: req.id } }));
    expect(row.delegationId).toBeTruthy();
    const delegation = await t.db.tenant(ws.workspaceId, (tx) => tx.approvalDelegation.findUniqueOrThrow({ where: { id: row.delegationId! } }));
    expect(delegation).toMatchObject({ delegatorUserId: manager.userId, delegateUserId: hr.userId, isActive: true });
    // The period is now covered: no delegate asked again (e.g. a half day inside it).
    expect((await preview(manager.token, { ...body, leaveTypeId: type('BEREAVEMENT'), startDate: '2030-12-04', endDate: '2030-12-04' })).needsDelegate).toBe(false);
  });
});

describe('filing on behalf (FR-LV-10)', () => {
  it('lets HR file for anyone and a manager for their reporting line only', async () => {
    const { ws, worker, woman, outsider, manager, hr, type } = await setup();
    const annual = type('ANNUAL');
    for (const p of [worker, woman, outsider]) await grant(ws, p.employeeId, annual, 2030, 15);

    const byHr = await file(hr.token, { employeeId: outsider.employeeId, leaveTypeId: annual, startDate: '2030-12-03', endDate: '2030-12-03' });
    expect(byHr).toMatchObject({ employeeId: outsider.employeeId, filedAs: 'HR', submittedByName: `hr@${ws.code}.test` });
    const audit = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findFirst({ where: { action: 'leave.requested', entityId: byHr.id } }));
    expect(audit).toMatchObject({ actorUserId: hr.userId, meta: expect.objectContaining({ filedAs: 'HR', employeeId: outsider.employeeId }) });

    const byManager = await file(manager.token, { employeeId: worker.employeeId, leaveTypeId: annual, startDate: '2030-12-03', endDate: '2030-12-03' });
    expect(byManager).toMatchObject({ employeeId: worker.employeeId, filedAs: 'MANAGER' });
    // The employee sees what was filed for them; the filer can attach the certificate.
    expect((await get(worker.token, `/leave/requests/${byManager.id}`)).statusCode).toBe(200);

    const notTheirs = await post(manager.token, '/leave/requests', { employeeId: outsider.employeeId, leaveTypeId: annual, startDate: '2030-12-04', endDate: '2030-12-04' });
    expect(notTheirs.statusCode).toBe(403);
    expect((await post(worker.token, '/leave/requests/preview', { employeeId: woman.employeeId, leaveTypeId: annual, startDate: '2030-12-04', endDate: '2030-12-04' })).statusCode).toBe(403);
  });
});

describe('GET /leave/requests and detail — scope', () => {
  it('lists own requests, the team in data scope, and hides others', async () => {
    const { ws, worker, woman, outsider, manager, hr, type } = await setup();
    const annual = type('ANNUAL');
    for (const p of [worker, woman, outsider]) await grant(ws, p.employeeId, annual, 2030, 15);
    const w = await file(worker.token, { leaveTypeId: annual, startDate: '2030-12-03', endDate: '2030-12-03' });
    const wo = await file(woman.token, { leaveTypeId: annual, startDate: '2030-12-04', endDate: '2030-12-04' });
    const o = await file(outsider.token, { leaveTypeId: annual, startDate: '2030-12-05', endDate: '2030-12-05' });

    const ids = async (token: string, q: string) => (await get(token, `/leave/requests${q}`)).json<LeaveRequest[]>().map((r) => r.id).sort();
    expect(await ids(worker.token, '')).toEqual([w.id]);
    expect(await ids(worker.token, '?scope=team')).toEqual([w.id]);
    expect(await ids(manager.token, '?scope=team')).toEqual([w.id, wo.id].sort());
    expect(await ids(hr.token, '?scope=team')).toEqual([w.id, wo.id, o.id].sort());
    expect(await ids(hr.token, '?scope=team&year=2029')).toEqual([]);
    expect(await ids(hr.token, '?scope=team&status=APPROVED')).toEqual([]);
    expect((await get(hr.token, '/leave/requests')).statusCode).toBe(404); // HR has no employee profile

    expect((await get(outsider.token, `/leave/requests/${w.id}`)).statusCode).toBe(404);
    expect((await get(manager.token, `/leave/requests/${o.id}`)).statusCode).toBe(404);
    expect((await get(hr.token, `/leave/requests/${o.id}`)).json<LeaveRequest>()).toMatchObject({ id: o.id, employeeName: expect.any(String) });
  });

  it('isolates workspaces', async () => {
    const a = await setup();
    const b = await setup();
    await grant(a.ws, a.worker.employeeId, a.type('ANNUAL'), 2030, 15);
    const req = await file(a.worker.token, { leaveTypeId: a.type('ANNUAL'), startDate: '2030-12-03', endDate: '2030-12-03' });
    expect((await get(b.hr.token, `/leave/requests/${req.id}`)).statusCode).toBe(404);
    expect((await get(b.hr.token, '/leave/requests?scope=team')).json<LeaveRequest[]>().map((r) => r.id)).not.toContain(req.id);
    const foreign = await post(b.hr.token, '/leave/requests/preview', { employeeId: a.worker.employeeId, leaveTypeId: b.type('ANNUAL'), startDate: '2030-12-03', endDate: '2030-12-03' });
    expect(foreign.statusCode).toBe(404);
    const foreignType = await post(b.worker.token, '/leave/requests/preview', { leaveTypeId: a.type('ANNUAL'), startDate: '2030-12-03', endDate: '2030-12-03' });
    expect(foreignType.statusCode).toBe(404);
  });
});
