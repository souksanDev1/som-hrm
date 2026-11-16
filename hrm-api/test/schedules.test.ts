import {
  isoDateInTimeZone,
  type EmployeeWorkSchedule,
  type ScheduleOverrideList,
  type StandardScheduleView,
} from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveEmployeeWorkPattern } from '../src/modules/schedules/schedules.service';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const SIX_DAYS = [0, 8, 8, 8, 8, 8, 8];
const FIVE_DAYS = [0, 8, 8, 8, 8, 8, 0];
const HALF_SAT = [0, 8, 8, 8, 8, 8, 4];
const REST_MONDAY = [8, 0, 8, 8, 8, 8, 8];

const today = () => isoDateInTimeZone('Asia/Vientiane');
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const ownerToken = async (ws: WorkspaceFixture) => (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
const get = (token: string, path: string) => t.app.inject({ method: 'GET', url: api(path), headers: bearer(token) });
const post = (token: string, path: string, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'POST', url: api(path), headers: bearer(token), payload });

const setStandard = (token: string, dayHours: number[], effectiveFrom: string, reason = 'policy') =>
  post(token, '/settings/work-schedule', { dayHours, effectiveFrom, reason });
const applyOverride = (token: string, employeeIds: string[], dayHours: number[], effectiveFrom: string, extra: Record<string, unknown> = {}) =>
  post(token, '/settings/work-schedule/overrides', { employeeIds, dayHours, effectiveFrom, reason: 'contract', ...extra });
const revert = (token: string, employeeIds: string[], effectiveFrom: string) =>
  post(token, '/settings/work-schedule/overrides/revert', { employeeIds, effectiveFrom, reason: 'back' });
const employeeSchedule = async (token: string, id: string) => (await get(token, `/employees/${id}/work-schedule`)).json<EmployeeWorkSchedule>();

let seq = 0;
const addEmployee = (ws: WorkspaceFixture) =>
  t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: `S${++seq}`, firstName: 'ສົມ', lastName: `${seq}`, gender: 'MALE',
        hireDate: new Date('2024-01-01'), employmentType: 'FULL_TIME',
      },
    }),
  );

const auditRows = (ws: WorkspaceFixture, action: string) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { workspaceId: ws.workspaceId, action }, orderBy: { createdAt: 'asc' } }));

describe('standard schedule (FR-WS-03.1)', () => {
  it('starts every new workspace on Mon–Sat 8 h (48 h) with limits from the parameter store', async () => {
    const ws = await createWorkspace(t.db);
    const res = await get(await ownerToken(ws), '/settings/work-schedule');
    expect(res.statusCode).toBe(200);
    const view = res.json<StandardScheduleView>();
    expect(view.asOf).toBe(today());
    expect(view.current).toMatchObject({ dayHours: SIX_DAYS, weeklyHours: 48, effectiveFrom: today() });
    expect(view.limits).toEqual({ maxHoursPerDay: 8, maxHoursPerWeek: 48 });
    expect(view.scheduled).toEqual([]);
    expect(view.history).toHaveLength(1);
  });

  it('schedules a future standard without changing today, then replaces it for the same date', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const future = addDays(today(), 30);

    const first = await setStandard(token, FIVE_DAYS, future, 'five-day week');
    expect(first.statusCode).toBe(201);
    const v1 = first.json<StandardScheduleView>();
    expect(v1.current.dayHours).toEqual(SIX_DAYS);
    expect(v1.scheduled).toHaveLength(1);
    expect(v1.scheduled[0]).toMatchObject({ effectiveFrom: future, dayHours: FIVE_DAYS, weeklyHours: 40, reason: 'five-day week', createdByName: 'Owner' });

    const second = await setStandard(token, HALF_SAT, future, 'half Saturday');
    const v2 = second.json<StandardScheduleView>();
    expect(v2.scheduled).toHaveLength(1);
    expect(v2.scheduled[0]).toMatchObject({ dayHours: HALF_SAT, weeklyHours: 44 });

    const [change] = await auditRows(ws, 'schedule.standard.change');
    expect(change).toMatchObject({ entity: 'WorkSchedule', actorUserId: expect.any(String) });
    expect(change!.meta).toMatchObject({ effectiveFrom: future, oldDayHours: SIX_DAYS, newDayHours: FIVE_DAYS, reason: 'five-day week' });
    const [resched] = await auditRows(ws, 'schedule.standard.reschedule');
    expect(resched!.meta).toMatchObject({ oldDayHours: FIVE_DAYS, newDayHours: HALF_SAT });
  });

  it('applies a change effective today and keeps the history', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const res = await setStandard(token, FIVE_DAYS, today());
    expect(res.statusCode).toBe(201);
    const view = res.json<StandardScheduleView>();
    expect(view.current.dayHours).toEqual(FIVE_DAYS);
    // The bootstrap version had the same date, so it is replaced; old/new stay in the audit log.
    expect((await auditRows(ws, 'schedule.standard.reschedule'))[0]!.meta).toMatchObject({ oldDayHours: SIX_DAYS, newDayHours: FIVE_DAYS });

    const later = await setStandard(token, HALF_SAT, addDays(today(), 1));
    expect(later.json<StandardScheduleView>().history.map((h) => h.dayHours)).toEqual([FIVE_DAYS]);
  });

  it('rejects past dates, more than 48 h a week and days longer than the standard day', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const past = await setStandard(token, FIVE_DAYS, addDays(today(), -1));
    expect(past.statusCode).toBe(400);
    expect(past.json().error).toMatchObject({ code: 'effective_date_in_past', details: { field: 'effectiveFrom' } });

    const week = await setStandard(token, [8, 8, 8, 8, 8, 8, 8], today());
    expect(week.statusCode).toBe(400);
    expect(week.json().error).toMatchObject({ code: 'schedule_week_hours_exceeded', details: { field: 'dayHours', maxHoursPerWeek: 48 } });

    const day = await setStandard(token, [0, 9, 8, 8, 8, 8, 0], today());
    expect(day.json().error.code).toBe('schedule_day_hours_exceeded');

    const none = await setStandard(token, [0, 0, 0, 0, 0, 0, 0], today());
    expect(none.json().error.code).toBe('schedule_no_working_days');

    const quarter = await setStandard(token, [0, 7.25, 8, 8, 8, 8, 0], today());
    expect(quarter.json().error.code).toBe('validation_error');
  });

  it('reads the hour limits from effective-dated parameters (legal max 48 h/week)', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const tooHigh = await post(token, '/settings/parameters', { key: 'schedule.maxHoursPerWeek', value: 49, effectiveFrom: today(), reason: 'x' });
    expect(tooHigh.statusCode).toBe(400);
    expect(tooHigh.json().error.code).toBe('above_legal_maximum');

    const future = addDays(today(), 10);
    expect((await post(token, '/settings/parameters', { key: 'schedule.maxHoursPerWeek', value: 40, effectiveFrom: future, reason: 'x' })).statusCode).toBe(201);
    // 48 h is still fine before the lower limit takes effect, rejected from that date on.
    expect((await setStandard(token, SIX_DAYS, addDays(future, -1))).statusCode).toBe(201);
    const after = await setStandard(token, SIX_DAYS, future);
    expect(after.json().error).toMatchObject({ code: 'schedule_week_hours_exceeded', details: { maxHoursPerWeek: 40 } });
    expect((await setStandard(token, FIVE_DAYS, future)).statusCode).toBe(201);
  });
});

describe('individual schedules (FR-WS-03.2–03.4, 03.6, 03.7)', () => {
  it('bulk-applies one override to the selected employees only, audited per employee', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const [a, b, c] = [await addEmployee(ws), await addEmployee(ws), await addEmployee(ws)];

    const res = await applyOverride(token, [a.id, b.id, a.id], REST_MONDAY, today(), { label: 'Rest Monday' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ count: 2 });

    const sa = await employeeSchedule(token, a.id);
    expect(sa.current).toMatchObject({ source: 'override', dayHours: REST_MONDAY, workingDays: [0, 2, 3, 4, 5, 6], label: 'Rest Monday', effectiveFrom: today() });
    expect(sa.history).toHaveLength(1);
    expect(sa.history[0]).toMatchObject({ source: 'override', reason: 'contract', createdByName: 'Owner' });
    expect((await employeeSchedule(token, c.id)).current).toMatchObject({ source: 'standard', dayHours: SIX_DAYS });

    const list = (await get(token, '/settings/work-schedule/overrides')).json<ScheduleOverrideList>();
    expect(list.items.map((i) => i.employee.id).sort()).toEqual([a.id, b.id].sort());

    const audits = await auditRows(ws, 'schedule.override.apply');
    expect(audits.map((x) => x.entityId).sort()).toEqual([a.id, b.id].sort());
    expect(audits[0]!.meta).toMatchObject({
      effectiveFrom: today(),
      reason: 'contract',
      old: { source: 'standard', dayHours: SIX_DAYS },
      new: { source: 'override', dayHours: REST_MONDAY, label: 'Rest Monday' },
    });
  });

  it('does not move employees with an override when the standard changes (03.6)', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const [onOverride, onStandard] = [await addEmployee(ws), await addEmployee(ws)];
    await applyOverride(token, [onOverride.id], HALF_SAT, today());

    const change = addDays(today(), 7);
    expect((await setStandard(token, FIVE_DAYS, change)).statusCode).toBe(201);
    await t.db.tenant(ws.workspaceId, async (tx) => {
      const r = (id: string, date: string) => resolveEmployeeWorkPattern(tx, ws.workspaceId, id, date);
      expect(await r(onOverride.id, change)).toMatchObject({ source: 'override', dayHours: HALF_SAT });
      expect(await r(onStandard.id, addDays(change, -1))).toMatchObject({ source: 'standard', dayHours: SIX_DAYS });
      expect(await r(onStandard.id, change)).toMatchObject({ source: 'standard', dayHours: FIVE_DAYS, effectiveFrom: change });
    });
  });

  it('starts an override exactly on its effective date (resolver boundary)', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const e = await addEmployee(ws);
    const start = addDays(today(), 3);
    await applyOverride(token, [e.id], FIVE_DAYS, start);
    await t.db.tenant(ws.workspaceId, async (tx) => {
      expect((await resolveEmployeeWorkPattern(tx, ws.workspaceId, e.id, addDays(start, -1))).source).toBe('standard');
      expect((await resolveEmployeeWorkPattern(tx, ws.workspaceId, e.id, start)).source).toBe('override');
      // Dates before the first standard version fall back to it (e.g. the hire date).
      expect((await resolveEmployeeWorkPattern(tx, ws.workspaceId, e.id, '2024-01-01')).source).toBe('standard');
    });
    const view = await employeeSchedule(token, e.id);
    expect(view.current.source).toBe('standard');
    expect(view.upcoming).toEqual([expect.objectContaining({ effectiveFrom: start, source: 'override', dayHours: FIVE_DAYS })]);
    // A scheduled (not yet active) override is listed with its next change.
    const list = (await get(token, '/settings/work-schedule/overrides')).json<ScheduleOverrideList>();
    expect(list.items[0]).toMatchObject({ current: { source: 'standard' }, next: { effectiveFrom: start, source: 'override' } });
  });

  it('reverts to the standard from a date, and refuses employees already on the standard (03.4)', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const [a, b] = [await addEmployee(ws), await addEmployee(ws)];
    await applyOverride(token, [a.id], FIVE_DAYS, today());

    const notOverridden = await revert(token, [a.id, b.id], today());
    expect(notOverridden.statusCode).toBe(409);
    expect(notOverridden.json().error).toMatchObject({ code: 'schedule_not_overridden', details: { employeeIds: [b.id] } });

    const later = addDays(today(), 5);
    const res = await revert(token, [a.id], later);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ count: 1 });
    const view = await employeeSchedule(token, a.id);
    expect(view.current.source).toBe('override');
    expect(view.upcoming).toEqual([expect.objectContaining({ effectiveFrom: later, source: 'standard', dayHours: null })]);

    const [audit] = await auditRows(ws, 'schedule.override.revert');
    expect(audit).toMatchObject({ entity: 'Employee', entityId: a.id });
    expect(audit!.meta).toMatchObject({ effectiveFrom: later, old: { source: 'override', dayHours: FIVE_DAYS }, new: { source: 'standard' } });

    // Reverting today puts the employee back on the standard immediately.
    expect((await revert(token, [a.id], today())).statusCode).toBe(200);
    expect((await employeeSchedule(token, a.id)).current).toMatchObject({ source: 'standard', dayHours: SIX_DAYS });
  });

  it('validates overrides: limits, past dates and unknown employees', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const e = await addEmployee(ws);
    expect((await applyOverride(token, [e.id], [8, 8, 8, 8, 8, 8, 8], today())).json().error.code).toBe('schedule_week_hours_exceeded');
    expect((await applyOverride(token, [e.id], FIVE_DAYS, addDays(today(), -1))).json().error.code).toBe('effective_date_in_past');
    const unknown = await applyOverride(token, [e.id, 'nope'], FIVE_DAYS, today());
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('invalid_reference');
    // Nothing was written by the rejected requests.
    expect((await employeeSchedule(token, e.id)).history).toEqual([]);
  });
});

describe('access and tenant isolation', () => {
  it('lets OWNER and HR_ADMIN manage schedules; MANAGER and EMPLOYEE cannot', async () => {
    const ws = await createWorkspace(t.db);
    await createUser(t.db, ws, { email: 'hr@x.test', password: 'Hr12345678', role: 'HR_ADMIN' });
    await createUser(t.db, ws, { email: 'mgr@x.test', password: 'Mgr12345678', role: 'MANAGER' });
    await createUser(t.db, ws, { email: 'emp@x.test', password: 'Emp12345678', role: 'EMPLOYEE' });
    const hr = (await loginAs(t.app, ws.code, 'hr@x.test', 'Hr12345678')).accessToken;
    const mgr = (await loginAs(t.app, ws.code, 'mgr@x.test', 'Mgr12345678')).accessToken;
    const emp = (await loginAs(t.app, ws.code, 'emp@x.test', 'Emp12345678')).accessToken;

    expect((await get(hr, '/settings/work-schedule')).statusCode).toBe(200);
    expect((await setStandard(hr, FIVE_DAYS, addDays(today(), 1))).statusCode).toBe(201);
    for (const token of [mgr, emp]) {
      expect((await get(token, '/settings/work-schedule')).statusCode).toBe(403);
      expect((await get(token, '/settings/work-schedule/overrides')).statusCode).toBe(403);
      expect((await setStandard(token, FIVE_DAYS, addDays(today(), 1))).statusCode).toBe(403);
    }
  });

  it('shows employees their own schedule on /me/work-schedule', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const e = await addEmployee(ws);
    await createUser(t.db, ws, { email: 'me@x.test', password: 'Emp12345678', role: 'EMPLOYEE', employeeId: e.id });
    await applyOverride(token, [e.id], HALF_SAT, today());
    const me = (await loginAs(t.app, ws.code, 'me@x.test', 'Emp12345678')).accessToken;
    const res = await get(me, '/me/work-schedule');
    expect(res.statusCode).toBe(200);
    expect(res.json<EmployeeWorkSchedule>()).toMatchObject({ employeeId: e.id, current: { source: 'override', dayHours: HALF_SAT, weeklyHours: 44 } });
    // The employee role has no employee.read, so other employees' schedules are not reachable.
    expect((await get(me, `/employees/${e.id}/work-schedule`)).statusCode).toBe(403);
    // An account without an employee record has no own schedule.
    expect((await get(token, '/me/work-schedule')).statusCode).toBe(404);
  });

  it('isolates schedules between workspaces (API and RLS)', async () => {
    const a = await createWorkspace(t.db);
    const b = await createWorkspace(t.db);
    const tokenA = await ownerToken(a);
    const tokenB = await ownerToken(b);
    const ea = await addEmployee(a);
    await applyOverride(tokenA, [ea.id], FIVE_DAYS, today());

    expect((await applyOverride(tokenB, [ea.id], FIVE_DAYS, today())).json().error.code).toBe('invalid_reference');
    expect((await revert(tokenB, [ea.id], today())).json().error.code).toBe('invalid_reference');
    expect((await get(tokenB, `/employees/${ea.id}/work-schedule`)).statusCode).toBe(404);
    expect((await get(tokenB, '/settings/work-schedule/overrides')).json<ScheduleOverrideList>().items).toEqual([]);

    // Even unfiltered queries only see the tenant's own rows.
    const seenByB = await t.db.tenant(b.workspaceId, (tx) => tx.scheduleAssignment.count());
    expect(seenByB).toBe(0);
    const schedulesSeenByB = await t.db.tenant(b.workspaceId, (tx) => tx.workSchedule.findMany({ select: { workspaceId: true } }));
    expect(new Set(schedulesSeenByB.map((s) => s.workspaceId))).toEqual(new Set([b.workspaceId]));
    expect(await t.db.client.scheduleAssignment.count()).toBe(0); // no tenant scope → fail closed
    await expect(
      t.db.tenant(b.workspaceId, (tx) =>
        tx.scheduleAssignment.create({ data: { workspaceId: a.workspaceId, employeeId: ea.id, effectiveFrom: new Date('2030-01-01') } }),
      ),
    ).rejects.toThrow();
  });
});
