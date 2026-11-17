import { parseTimeOfDay, zonedInstant, type ApprovalRequestDetail, type MyOvertime, type OvertimePreview, type OvertimeReport, type OvertimeRequestView } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runOvertimeActuals } from '../src/jobs';
import { parseIsoDate } from '../src/lib/dates';
import { createPunches } from '../src/modules/attendance/punches';
import { submitApproval } from '../src/modules/approvals/approvals.service';
import { defaultApprovalRegistry } from '../src/modules/approvals/registry';
import { settleOvertimeActuals } from '../src/modules/overtime/overtime.actuals';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

/** Overtime requests (FR-ATT-20..23) on PostgreSQL: split, caps, overlap rules, approval, actuals, scope, tenancy. */
let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const TZ = 'Asia/Vientiane';
const at = (date: string, hhmm: string) => zonedInstant(date, parseTimeOfDay(hhmm)!, TZ);
const PASSWORD = 'Person12345';

interface Person {
  employeeId: string;
  token: string;
}

let seq = 0;
const person = async (ws: WorkspaceFixture, opts: { managerId?: string | null; role?: string; gender?: 'MALE' | 'FEMALE' } = {}): Promise<Person> => {
  const n = ++seq;
  const emp = await t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: `OT${n}`, firstName: 'ສົມ', lastName: `P${n}`, gender: opts.gender ?? 'MALE',
        hireDate: new Date('2024-01-01'), contractType: 'INDEFINITE', payType: 'MONTHLY', status: 'ACTIVE', managerId: opts.managerId ?? null,
      },
    }),
  );
  const email = `ot${n}@${ws.code}.test`;
  await createUser(t.db, ws, { email, password: PASSWORD, role: opts.role ?? 'EMPLOYEE', employeeId: emp.id });
  return { employeeId: emp.id, token: (await loginAs(t.app, ws.code, email, PASSWORD)).accessToken };
};

/** Workspace with manager → worker (man) and woman, plus an outsider not in the manager's tree. */
const setup = async () => {
  const ws = await createWorkspace(t.db);
  const manager = await person(ws, { role: 'MANAGER' });
  const worker = await person(ws, { managerId: manager.employeeId });
  const woman = await person(ws, { managerId: manager.employeeId, gender: 'FEMALE' });
  const outsider = await person(ws);
  const ownerToken = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
  return { ws, manager, worker, woman, outsider, ownerToken };
};

const post = (token: string, path: string, payload: Record<string, unknown>) => t.app.inject({ method: 'POST', url: api(path), headers: bearer(token), payload });
const get = (token: string, path: string) => t.app.inject({ method: 'GET', url: api(path), headers: bearer(token) });
const ot = (over: Record<string, unknown> = {}) => ({ kind: 'PRE', workDate: '2028-03-14', start: '17:30', end: '19:30', reason: 'Stock count', ...over });
const setParam = (ws: WorkspaceFixture, key: string, value: number | boolean) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.workspaceParameter.create({ data: { workspaceId: ws.workspaceId, key, value, effectiveFrom: new Date('2020-01-01') } }));

describe('overtime split (FR-ATT-21)', () => {
  it('splits across 22:00 and into the women-only 8 March for a woman but not for a man', async () => {
    const { ws, worker, woman } = await setup();
    await t.db.tenant(ws.workspaceId, (tx) =>
      tx.holiday.create({ data: { workspaceId: ws.workspaceId, date: parseIsoDate('2028-03-08'), nameLo: '8 ມີນາ', nameEn: 'Women', womenOnly: true } }),
    );
    // Tuesday 7 March 2028, 21:30 → Wednesday 8 March 00:30.
    const body = ot({ workDate: '2028-03-07', start: '21:30', end: '00:30' });
    const forWoman = (await post(woman.token, '/overtime/preview', body)).json<OvertimePreview>();
    expect(forWoman).toMatchObject({ workdayDayMinutes: 30, workdayNightMinutes: 120, holidayDayMinutes: 0, holidayNightMinutes: 30, minutes: 180 });
    expect(forWoman.day).toMatchObject({ total: 180, cap: 180, exceeded: false, warn: true });

    const res = await post(worker.token, '/overtime', body);
    expect(res.statusCode).toBe(201);
    expect(res.json<OvertimeRequestView>()).toMatchObject({
      status: 'PENDING', kind: 'PRE', workDate: '2028-03-07', plannedStartTime: '21:30', plannedEndTime: '00:30',
      workdayDayMinutes: 30, workdayNightMinutes: 150, holidayDayMinutes: 0, holidayNightMinutes: 0, minutes: 180, actualStart: null,
    });
  });

  it('counts the weekly rest day as holiday OT, and as workday OT when the parameter is off', async () => {
    const { ws, worker } = await setup();
    // Sunday 12 March 2028: rest day, no shift → no overlap.
    const sunday = ot({ workDate: '2028-03-12', start: '10:00', end: '12:00' });
    expect((await post(worker.token, '/overtime/preview', sunday)).json<OvertimePreview>()).toMatchObject({ holidayDayMinutes: 120, workdayDayMinutes: 0 });
    await setParam(ws, 'ot.restDayCountsAsHoliday', false);
    expect((await post(worker.token, '/overtime/preview', sunday)).json<OvertimePreview>()).toMatchObject({ holidayDayMinutes: 0, workdayDayMinutes: 120 });
  });
});

describe('overtime rules (FR-ATT-20, FR-ATT-22)', () => {
  it('refuses OT overlapping the scheduled shift or another request, and checks PRE/POST timing', async () => {
    const { worker } = await setup();
    const overlapShift = await post(worker.token, '/overtime', ot({ start: '16:00', end: '18:00' }));
    expect(overlapShift.statusCode).toBe(409);
    expect(overlapShift.json().error.code).toBe('ot_overlaps_shift');
    // Right after the 08:00–17:00 shift is fine; the next morning before 08:00 too.
    expect((await post(worker.token, '/overtime', ot({ start: '17:00', end: '18:00' }))).statusCode).toBe(201);
    const twice = await post(worker.token, '/overtime', ot({ start: '17:30', end: '18:30' }));
    expect(twice.statusCode).toBe(409);
    expect(twice.json().error.code).toBe('ot_overlaps_request');
    expect((await post(worker.token, '/overtime/preview', ot({ start: '06:00', end: '08:00' }))).statusCode).toBe(200);

    expect((await post(worker.token, '/overtime', ot({ workDate: '2025-06-02' }))).json().error.code).toBe('ot_pre_started');
    expect((await post(worker.token, '/overtime', ot({ kind: 'POST' }))).json().error.code).toBe('ot_post_in_future');
    const post2025 = await post(worker.token, '/overtime', ot({ kind: 'POST', workDate: '2025-06-02', start: '17:30', end: '19:00' }));
    expect(post2025.statusCode).toBe(201);
    expect(post2025.json<OvertimeRequestView>()).toMatchObject({ actualStartTime: '17:30', actualEndTime: '19:00', minutes: 90 });
  });

  it('warns at ot.warnPercent and blocks over the daily and monthly caps', async () => {
    const { ws, worker } = await setup();
    expect((await post(worker.token, '/overtime', ot({ start: '17:30', end: '19:30' }))).statusCode).toBe(201);
    const preview = (await post(worker.token, '/overtime/preview', ot({ start: '19:30', end: '20:30' }))).json<OvertimePreview>();
    expect(preview.day).toEqual({ total: 180, cap: 180, exceeded: false, warn: true });
    expect(preview.month).toMatchObject({ total: 180, cap: 2700, warn: false });
    const over = await post(worker.token, '/overtime', ot({ start: '19:30', end: '20:31' }));
    expect(over.statusCode).toBe(409);
    expect(over.json().error).toMatchObject({ code: 'ot_cap_exceeded', details: { day: { total: 181, exceeded: true } } });

    await setParam(ws, 'ot.maxMinutesPerMonth', 200);
    const monthPreview = (await post(worker.token, '/overtime/preview', ot({ workDate: '2028-03-15', start: '17:30', end: '18:00' }))).json<OvertimePreview>();
    expect(monthPreview.month).toEqual({ total: 150, cap: 200, exceeded: false, warn: false });
    const monthOver = await post(worker.token, '/overtime', ot({ workDate: '2028-03-15', start: '17:30', end: '18:51' }));
    expect(monthOver.json().error).toMatchObject({ code: 'ot_cap_exceeded', details: { month: { total: 201, exceeded: true } } });
    // A different month starts again from zero.
    expect((await post(worker.token, '/overtime', ot({ workDate: '2028-04-04', start: '17:30', end: '18:51' }))).statusCode).toBe(201);
  });

  it('validates input and needs an employee profile', async () => {
    const { worker, ownerToken } = await setup();
    expect((await post(worker.token, '/overtime', ot({ start: '25:00' }))).statusCode).toBe(400);
    expect((await post(worker.token, '/overtime', ot({ end: '17:30' }))).statusCode).toBe(400);
    expect((await post(worker.token, '/overtime', ot({ reason: '' }))).statusCode).toBe(400);
    expect((await get(worker.token, '/overtime/me?month=2028-13')).statusCode).toBe(400);
    const noProfile = await post(ownerToken, '/overtime/preview', ot());
    expect(noProfile.statusCode).toBe(404);
    expect(noProfile.json().error.code).toBe('no_employee_profile');
  });
});

describe('approval, actuals and reports (FR-ATT-20.3, FR-ATT-21, FR-ATT-23)', () => {
  it('routes the request to the manager, approves it and shows it in the own month and the report', async () => {
    const { manager, worker } = await setup();
    const created = (await post(worker.token, '/overtime', ot({ start: '17:30', end: '19:00' }))).json<OvertimeRequestView>();
    expect(created.approvalRequestId).toBeTruthy();
    const detail = (await get(manager.token, `/approvals/${created.approvalRequestId}`)).json<ApprovalRequestDetail>();
    expect(detail.subjectType).toBe('OVERTIME');
    expect(detail.summary?.title).toContain('2028-03-14');
    expect(detail.summary?.detail).toContain('1:30');

    let mine = (await get(worker.token, '/overtime/me?month=2028-03')).json<MyOvertime>();
    expect(mine).toMatchObject({ pendingMinutes: 90, approved: { totalMinutes: 0 } });
    expect((await post(manager.token, `/approvals/${created.approvalRequestId}/approve`, {})).statusCode).toBe(200);
    mine = (await get(worker.token, '/overtime/me?month=2028-03')).json<MyOvertime>();
    expect(mine.items[0]).toMatchObject({ id: created.id, status: 'APPROVED' });
    expect(mine).toMatchObject({ pendingMinutes: 0, approved: { workdayDayMinutes: 90, totalMinutes: 90 } });

    const report = (await get(manager.token, '/overtime?month=2028-03')).json<OvertimeReport>();
    expect(report.rows).toEqual([expect.objectContaining({ employeeId: worker.employeeId, workdayDayMinutes: 90, totalMinutes: 90, requests: 1 })]);
    expect(report.totals.totalMinutes).toBe(90);
  });

  it('rejects: the request no longer counts toward the caps', async () => {
    const { manager, worker } = await setup();
    const created = (await post(worker.token, '/overtime', ot({ start: '17:30', end: '20:30' }))).json<OvertimeRequestView>();
    expect((await post(manager.token, `/approvals/${created.approvalRequestId}/reject`, { note: 'No budget' })).statusCode).toBe(200);
    const mine = (await get(worker.token, '/overtime/me?month=2028-03')).json<MyOvertime>();
    expect(mine.items[0]!.status).toBe('REJECTED');
    expect((await post(worker.token, '/overtime', ot({ start: '17:30', end: '20:30' }))).statusCode).toBe(201);
  });

  it('settles approved planned OT on the overlap with the worked time and re-splits it', async () => {
    const { ws, manager, worker } = await setup();
    // A planned request for a past Monday (filed then), approved after the day's punches are in.
    const pre = await t.db.tenant(ws.workspaceId, async (tx) => {
      const row = await tx.overtimeRequest.create({
        data: {
          workspaceId: ws.workspaceId, employeeId: worker.employeeId, workDate: parseIsoDate('2025-06-02'), kind: 'PRE',
          plannedStart: at('2025-06-02', '17:30'), plannedEnd: at('2025-06-02', '22:30'), reason: 'Audit', minutes: 300,
          workdayDayMinutes: 270, workdayNightMinutes: 30,
        },
      });
      await createPunches(tx, ws.workspaceId, [
        { employeeId: worker.employeeId, kind: 'IN', capturedAt: at('2025-06-02', '07:58'), source: 'MOBILE' },
        { employeeId: worker.employeeId, kind: 'OUT', capturedAt: at('2025-06-02', '22:10'), source: 'MOBILE' },
      ], at('2025-06-03', '09:00'));
      return { row, approval: await submitApproval(tx, defaultApprovalRegistry, { workspaceId: ws.workspaceId, subjectType: 'OVERTIME', subjectId: row.id, requesterEmployeeId: worker.employeeId, submittedByUserId: null }) };
    });
    expect((await post(manager.token, `/approvals/${pre.approval.id}/approve`, {})).statusCode).toBe(200);
    const mine = (await get(worker.token, '/overtime/me?month=2025-06')).json<MyOvertime>();
    expect(mine.items[0]).toMatchObject({ actualStartTime: '17:30', actualEndTime: '22:10', minutes: 280, workdayDayMinutes: 270, workdayNightMinutes: 10 });
  });

  it('keeps planned values without punches, then the job settles them (none worked = 0)', async () => {
    const { ws, worker } = await setup();
    const id = await t.db.tenant(ws.workspaceId, async (tx) =>
      (
        await tx.overtimeRequest.create({
          data: {
            workspaceId: ws.workspaceId, employeeId: worker.employeeId, workDate: parseIsoDate('2025-06-03'), kind: 'PRE', status: 'APPROVED',
            plannedStart: at('2025-06-03', '17:30'), plannedEnd: at('2025-06-03', '19:30'), reason: 'Audit', minutes: 120, workdayDayMinutes: 120,
          },
        })
      ).id,
    );
    const now = at('2025-06-04', '12:00');
    expect(await t.db.tenant(ws.workspaceId, (tx) => settleOvertimeActuals(tx, ws.workspaceId, now))).toBe(0);
    await t.db.tenant(ws.workspaceId, (tx) =>
      createPunches(tx, ws.workspaceId, [
        { employeeId: worker.employeeId, kind: 'IN', capturedAt: at('2025-06-03', '08:00'), source: 'MOBILE' },
        { employeeId: worker.employeeId, kind: 'OUT', capturedAt: at('2025-06-03', '17:05'), source: 'MOBILE' },
      ], now),
    );
    expect(await runOvertimeActuals(t.db, ws.workspaceId, now)).toEqual({ settled: 1 });
    const row = await t.db.tenant(ws.workspaceId, (tx) => tx.overtimeRequest.findUniqueOrThrow({ where: { id } }));
    expect(row).toMatchObject({ minutes: 0, workdayDayMinutes: 0 });
    expect(row.actualStart).not.toBeNull();
    expect(await runOvertimeActuals(t.db, ws.workspaceId, now)).toEqual({ settled: 0 });
  });
});

describe('overtime data scope and tenancy', () => {
  it('limits the report: employees 403, managers their tree, HR everyone; other workspaces see nothing', async () => {
    const { ws, manager, worker, outsider, ownerToken } = await setup();
    expect((await post(worker.token, '/overtime', ot())).statusCode).toBe(201);
    expect((await post(outsider.token, '/overtime', ot())).statusCode).toBe(201);

    expect((await get(worker.token, '/overtime?month=2028-03')).statusCode).toBe(403);
    const mgr = (await get(manager.token, '/overtime?month=2028-03')).json<OvertimeReport>();
    expect(mgr.items.map((i) => i.employeeId)).toEqual([worker.employeeId]);
    expect(mgr.rows).toEqual([]); // nothing approved yet
    expect((await get(manager.token, `/overtime?month=2028-03&employeeId=${outsider.employeeId}`)).statusCode).toBe(404);
    const hr = (await get(ownerToken, '/overtime?month=2028-03')).json<OvertimeReport>();
    expect(hr.items.map((i) => i.employeeId).sort()).toEqual([worker.employeeId, outsider.employeeId].sort());
    // Own list never shows colleagues.
    expect((await get(worker.token, '/overtime/me?month=2028-03')).json<MyOvertime>().items.map((i) => i.employeeId)).toEqual([worker.employeeId]);

    const other = await createWorkspace(t.db);
    const otherToken = (await loginAs(t.app, other.code, other.ownerEmail, OWNER_PASSWORD)).accessToken;
    expect((await get(otherToken, '/overtime?month=2028-03')).json<OvertimeReport>().items).toEqual([]);
    expect((await get(otherToken, `/overtime?month=2028-03&employeeId=${worker.employeeId}`)).statusCode).toBe(404);
    expect(await t.db.tenant(other.workspaceId, (tx) => tx.overtimeRequest.count())).toBe(0);
    expect(ws.workspaceId).not.toBe(other.workspaceId);
  });
});
