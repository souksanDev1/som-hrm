import {
  addDays,
  isoDateInTimeZone,
  parseTimeOfDay,
  zonedInstant,
  type AttendanceDayList,
  type AttendanceSummary,
  type RosterView,
  type Shift,
} from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAttendanceDaily } from '../src/jobs/handlers/attendance-daily';
import { parseIsoDate } from '../src/lib/dates';
import { createPunches } from '../src/modules/attendance/punches';
import { api, bearer, createTestContext, createUser, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

/** Shifts, roster, attendance-day reads and the daily job (FR-ATT-17, FR-ATT-18, FR-NOTI-03.3). */
let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const TZ = 'Asia/Vientiane';
const at = (date: string, hhmm: string) => zonedInstant(date, parseTimeOfDay(hhmm)!, TZ);
const today = () => isoDateInTimeZone(TZ);
/** A Monday at least a week in the past (a working day of the bootstrap Mon–Sat schedule). */
const pastMonday = () => {
  let d = addDays(today(), -7);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, -1);
  return d;
};

const ownerToken = async (ws: WorkspaceFixture) => (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', token: string, path: string, payload?: object) =>
  t.app.inject({ method, url: api(path), headers: bearer(token), ...(payload ? { payload } : {}) });

const addEmployee = async (token: string, extra: Record<string, unknown> = {}) => {
  const res = await req('POST', token, '/employees', employeePayload({ hireDate: '2024-01-15', ...extra }));
  expect(res.statusCode).toBe(201);
  return res.json<{ employee: { id: string } }>().employee.id;
};

const SHIFT = { name: 'Day', startTime: '08:00', endTime: '17:00', breakMinutes: 60 };
const NIGHT = { name: 'Night', code: 'N', color: '#1E3A8A', startTime: '22:00', endTime: '06:00', breakMinutes: 60 };

const auditActions = (ws: WorkspaceFixture) =>
  t.db.tenant(ws.workspaceId, async (tx) => (await tx.auditLog.findMany({ where: { workspaceId: ws.workspaceId }, orderBy: { createdAt: 'asc' } })).map((a) => a.action));

/** HR owner, a manager with one report, an unrelated employee, and logins for each. */
const team = async () => {
  const ws = await createWorkspace(t.db);
  const hr = await ownerToken(ws);
  const managerId = await addEmployee(hr);
  const reportId = await addEmployee(hr, { managerId });
  const otherId = await addEmployee(hr);
  await createUser(t.db, ws, { email: 'mgr@x.test', password: 'Manager1234', role: 'MANAGER', employeeId: managerId });
  await createUser(t.db, ws, { email: 'rep@x.test', password: 'Employee123', role: 'EMPLOYEE', employeeId: reportId });
  const manager = (await loginAs(t.app, ws.code, 'mgr@x.test', 'Manager1234')).accessToken;
  const employee = (await loginAs(t.app, ws.code, 'rep@x.test', 'Employee123')).accessToken;
  return { ws, hr, manager, employee, managerId, reportId, otherId };
};

const punchDay = (ws: WorkspaceFixture, employeeId: string, date: string, inAt: string, outAt?: string) =>
  t.db.tenant(ws.workspaceId, (tx) =>
    createPunches(tx, ws.workspaceId, [
      { employeeId, kind: 'IN', capturedAt: at(date, inAt), source: 'HR_ON_BEHALF', workDate: date },
      ...(outAt ? [{ employeeId, kind: 'OUT' as const, capturedAt: at(date, outAt), source: 'HR_ON_BEHALF' as const, workDate: date }] : []),
    ]),
  );

describe('shifts (FR-ATT-17.1/17.2)', () => {
  it('creates day and night shifts, validates with validateShift, and audits', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const day = await req('POST', token, '/shifts', SHIFT);
    expect(day.statusCode).toBe(201);
    expect(day.json<Shift>()).toMatchObject({ crossesMidnight: false, netMinutes: 480, lateGraceMinutes: null, isActive: true, inUse: false });

    const night = await req('POST', token, '/shifts', { ...NIGHT, lateGraceMinutes: 10 });
    expect(night.json<Shift>()).toMatchObject({ crossesMidnight: true, netMinutes: 420, code: 'N', color: '#1E3A8A', lateGraceMinutes: 10 });

    const same = await req('POST', token, '/shifts', { ...SHIFT, name: 'Zero', endTime: '08:00' });
    expect(same.statusCode).toBe(400);
    expect(same.json().error).toMatchObject({ code: 'shift_invalid_time', details: { field: 'endTime' } });
    const longBreak = await req('POST', token, '/shifts', { ...SHIFT, name: 'Long', breakMinutes: 540 });
    expect(longBreak.json().error).toMatchObject({ code: 'shift_break_too_long', details: { field: 'breakMinutes' } });
    expect((await req('POST', token, '/shifts', { ...SHIFT, name: 'Bad', startTime: '25:00' })).statusCode).toBe(400);
    expect((await req('POST', token, '/shifts', { ...SHIFT, name: 'Bad', color: 'red' })).statusCode).toBe(400);
    const dup = await req('POST', token, '/shifts', SHIFT);
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('shift_name_taken');

    const patched = await req('PATCH', token, `/shifts/${day.json<Shift>().id}`, { endTime: '16:00', earlyGraceMinutes: 5 });
    expect(patched.json<Shift>()).toMatchObject({ endTime: '16:00', earlyGraceMinutes: 5, netMinutes: 420 });
    const invalidPatch = await req('PATCH', token, `/shifts/${day.json<Shift>().id}`, { breakMinutes: 600 });
    expect(invalidPatch.json().error.code).toBe('shift_break_too_long');

    const list = (await req('GET', token, '/shifts')).json<Shift[]>();
    // Bootstrap shift (in use by the standard schedule) + the two created.
    expect(list).toHaveLength(3);
    expect(list.find((s) => s.startTime === '08:00' && s.inUse)).toBeTruthy();
    expect(await auditActions(ws)).toEqual(expect.arrayContaining(['shift.create', 'shift.update']));
  });

  it('deletes an unused shift but only deactivates one in use', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const unused = (await req('POST', token, '/shifts', SHIFT)).json<Shift>();
    expect((await req('DELETE', token, `/shifts/${unused.id}`)).json()).toEqual({ result: 'deleted' });

    const bootstrap = (await req('GET', token, '/shifts')).json<Shift[]>()[0]!;
    expect((await req('DELETE', token, `/shifts/${bootstrap.id}`)).json()).toEqual({ result: 'deactivated' });
    const after = (await req('GET', token, '/shifts')).json<Shift[]>();
    expect(after).toEqual([expect.objectContaining({ id: bootstrap.id, isActive: false })]);
    expect((await req('GET', token, '/shifts?active=true')).json<Shift[]>()).toEqual([]);
    expect(await auditActions(ws)).toEqual(expect.arrayContaining(['shift.delete', 'shift.deactivate']));
  });

  it('lets managers read the shift list but not write it; employees get 403; other workspaces 404', async () => {
    const { ws, hr, manager, employee } = await team();
    expect((await req('GET', manager, '/shifts')).statusCode).toBe(200);
    expect((await req('POST', manager, '/shifts', SHIFT)).statusCode).toBe(403);
    expect((await req('GET', employee, '/shifts')).statusCode).toBe(403);

    const shift = (await req('POST', hr, '/shifts', SHIFT)).json<Shift>();
    const other = await createWorkspace(t.db);
    const otherToken = await ownerToken(other);
    expect((await req('PATCH', otherToken, `/shifts/${shift.id}`, { name: 'x' })).statusCode).toBe(404);
    expect((await req('DELETE', otherToken, `/shifts/${shift.id}`)).statusCode).toBe(404);
    expect((await req('GET', otherToken, '/shifts')).json<Shift[]>().map((s) => s.id)).not.toContain(shift.id);
    expect(ws.workspaceId).not.toBe(other.workspaceId);
  });
});

describe('roster (FR-ATT-17.3)', () => {
  it('shows the schedule by default, overrides with roster cells, recomputes past days and clears back', async () => {
    const { ws, hr, reportId } = await team();
    const monday = pastMonday();
    const sunday = addDays(monday, -1);
    const night = (await req('POST', hr, '/shifts', NIGHT)).json<Shift>();

    const view = (await req('GET', hr, `/roster?from=${sunday}&to=${monday}`)).json<RosterView>();
    expect(view.employees).toHaveLength(3);
    const cell = (v: RosterView, date: string) => v.cells.find((c) => c.employeeId === reportId && c.date === date)!;
    expect(cell(view, sunday)).toMatchObject({ shiftId: null, source: 'SCHEDULE' });
    const standardShift = cell(view, monday).shiftId;
    expect(standardShift).toBeTruthy();

    // Worked a night on Monday: on the standard 08:00 shift that is very late; rostered to the night shift it is on time.
    await t.db.tenant(ws.workspaceId, (tx) =>
      createPunches(tx, ws.workspaceId, [
        { employeeId: reportId, kind: 'IN', capturedAt: at(monday, '22:00'), source: 'HR_ON_BEHALF', workDate: monday },
        { employeeId: reportId, kind: 'OUT', capturedAt: at(addDays(monday, 1), '06:00'), source: 'HR_ON_BEHALF', workDate: monday },
      ]),
    );
    const dayRow = () => t.db.tenant(ws.workspaceId, (tx) => tx.attendanceDay.findUnique({ where: { employeeId_workDate: { employeeId: reportId, workDate: parseIsoDate(monday) } } }));
    expect((await dayRow())!.status).toBe('LATE');

    const set = await req('PUT', hr, '/roster', { cells: [{ employeeId: reportId, date: monday, shiftId: night.id }, { employeeId: reportId, date: addDays(today(), 7), shiftId: null }] });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual({ updated: 2, recomputed: 1 });
    expect(await dayRow()).toMatchObject({ status: 'PRESENT', lateMinutes: 0, shiftId: night.id });
    expect(cell((await req('GET', hr, `/roster?from=${sunday}&to=${monday}`)).json<RosterView>(), monday)).toMatchObject({ shiftId: night.id, source: 'ROSTER' });
    const [nightDay] = (await req('GET', hr, `/attendance/days?from=${monday}&to=${monday}&employeeId=${reportId}`)).json<AttendanceDayList>().items;
    expect(nightDay).toMatchObject({ shiftName: 'Night', shiftCode: 'N', firstInLocal: '22:00', lastOutLocal: '06:00 +1', scheduledEndLocal: '06:00 +1' });

    const cleared = await req('DELETE', hr, '/roster', { cells: [{ employeeId: reportId, date: monday }] });
    expect(cleared.json()).toEqual({ updated: 1, recomputed: 1 });
    expect((await dayRow())!.status).toBe('LATE');
    expect(cell((await req('GET', hr, `/roster?from=${sunday}&to=${monday}`)).json<RosterView>(), monday)).toMatchObject({ shiftId: standardShift, source: 'SCHEDULE' });
    expect(await auditActions(ws)).toEqual(expect.arrayContaining(['roster.set', 'roster.clear']));
  });

  it('validates shifts, ranges, permissions and scope', async () => {
    const { ws, hr, manager, employee, reportId, otherId } = await team();
    const date = today();
    const shift = (await req('POST', hr, '/shifts', SHIFT)).json<Shift>();
    await req('PATCH', hr, `/shifts/${shift.id}`, { isActive: false });
    expect((await req('PUT', hr, '/roster', { cells: [{ employeeId: reportId, date, shiftId: shift.id }] })).json().error.code).toBe('shift_inactive');
    expect((await req('PUT', hr, '/roster', { cells: [{ employeeId: reportId, date, shiftId: 'nope' }] })).json().error.code).toBe('shift_not_found');
    expect((await req('GET', hr, `/roster?from=${date}&to=${addDays(date, 70)}`)).json().error.code).toBe('range_too_long');
    expect((await req('GET', hr, `/roster?from=${date}&to=${addDays(date, -1)}`)).statusCode).toBe(400);

    // Manager reads their tree only; cannot write; employees cannot read the roster.
    const mv = (await req('GET', manager, `/roster?from=${date}&to=${date}`)).json<RosterView>();
    expect(mv.employees.map((e) => e.id)).toContain(reportId);
    expect(mv.employees.map((e) => e.id)).not.toContain(otherId);
    expect((await req('PUT', manager, '/roster', { cells: [{ employeeId: reportId, date, shiftId: null }] })).statusCode).toBe(403);
    expect((await req('GET', employee, `/roster?from=${date}&to=${date}`)).statusCode).toBe(403);

    // Another workspace's employee is not found.
    const other = await createWorkspace(t.db);
    const foreign = await addEmployee(await ownerToken(other));
    expect((await req('PUT', hr, '/roster', { cells: [{ employeeId: foreign, date, shiftId: null }] })).statusCode).toBe(404);
    expect(ws.workspaceId).toBeTruthy();
  });
});

describe('attendance days read (FR-ATT-18)', () => {
  it('scopes by role: HR all, manager their tree, employee themselves, other workspace nothing', async () => {
    const { ws, hr, manager, employee, managerId, reportId, otherId } = await team();
    const monday = pastMonday();
    await punchDay(ws, managerId, monday, '08:00', '17:00');
    await punchDay(ws, reportId, monday, '08:20', '16:30');
    await punchDay(ws, otherId, monday, '08:00', '17:00');
    const q = `/attendance/days?from=${monday}&to=${monday}`;

    const all = (await req('GET', hr, q)).json<AttendanceDayList>().items;
    expect(all.map((d) => d.employeeId).sort()).toEqual([managerId, reportId, otherId].sort());
    const rep = all.find((d) => d.employeeId === reportId)!;
    expect(rep).toMatchObject({ status: 'LATE', lateMinutes: 20, earlyLeaveMinutes: 30, workDate: monday, shiftName: expect.any(String) });
    expect(rep.firstInAt).toBe(at(monday, '08:20').toISOString());

    expect((await req('GET', hr, `${q}&status=LATE`)).json<AttendanceDayList>().items.map((d) => d.employeeId)).toEqual([reportId]);

    const mine = (await req('GET', manager, q)).json<AttendanceDayList>().items.map((d) => d.employeeId).sort();
    expect(mine).toEqual([managerId, reportId].sort());
    expect((await req('GET', manager, `${q}&employeeId=${otherId}`)).statusCode).toBe(404);

    expect((await req('GET', employee, q)).json<AttendanceDayList>().items.map((d) => d.employeeId)).toEqual([reportId]);
    expect((await req('GET', employee, `${q}&employeeId=${managerId}`)).statusCode).toBe(404);

    const other = await createWorkspace(t.db);
    const otherHr = await ownerToken(other);
    expect((await req('GET', otherHr, q)).json<AttendanceDayList>().items).toEqual([]);
    expect((await req('GET', otherHr, `${q}&employeeId=${reportId}`)).json<AttendanceDayList>().items).toEqual([]);

    expect((await req('GET', hr, `/attendance/days?from=${monday}&to=${addDays(monday, 100)}`)).json().error.code).toBe('range_too_long');
    expect((await req('GET', hr, `/attendance/days?from=${monday}&to=${monday}&status=NOPE`)).statusCode).toBe(400);
  });

  it('summarises a month per status with minute totals', async () => {
    const { ws, hr, employee, reportId } = await team();
    const monday = pastMonday();
    const tuesday = addDays(monday, 1);
    await punchDay(ws, reportId, monday, '08:20', '17:00');
    await punchDay(ws, reportId, tuesday, '08:00', '17:00');
    const month = monday.slice(0, 7);
    const res = await req('GET', employee, `/attendance/days/summary?month=${month}`);
    expect(res.statusCode).toBe(200);
    const s = res.json<AttendanceSummary>();
    // Both days are in the same month unless Monday is the last day of it.
    if (tuesday.slice(0, 7) === month) {
      expect(s).toMatchObject({ month, employeeId: null, days: 2, lateMinutes: 20 });
      expect(s.counts).toMatchObject({ LATE: 1, PRESENT: 1, ABSENT: 0 });
      expect(s.workedMinutes).toBe(460 + 480);
    }
    expect((await req('GET', hr, `/attendance/days/summary?month=${month}&employeeId=${reportId}`)).json<AttendanceSummary>().counts.LATE).toBe(1);
    expect((await req('GET', hr, '/attendance/days/summary?month=2026-13')).statusCode).toBe(400);
  });
});

describe('attendance-daily job (FR-ATT-18, FR-NOTI-03.3)', () => {
  it('marks absences and missing punches for yesterday/today and notifies a missing punch once', async () => {
    const { ws, managerId, reportId } = await team();
    const monday = pastMonday();
    const tuesday = addDays(monday, 1);
    // Report checked in on Tuesday but never out; manager did nothing (absent).
    await punchDay(ws, reportId, tuesday, '08:00');
    const now = at(tuesday, '20:00'); // after 17:00 + 120 min cutoff

    const first = await runAttendanceDaily(t.db, ws.workspaceId, now);
    expect(first).toMatchObject({ employees: 3, recomputed: 6, notified: 1 });
    const days = await t.db.tenant(ws.workspaceId, (tx) => tx.attendanceDay.findMany({ where: { workspaceId: ws.workspaceId, workDate: parseIsoDate(tuesday) } }));
    expect(days.find((d) => d.employeeId === reportId)).toMatchObject({ status: 'MISSING_OUT', missingNotifiedAt: now });
    expect(days.find((d) => d.employeeId === managerId)!.status).toBe('ABSENT');

    const notes = await t.db.tenant(ws.workspaceId, (tx) => tx.notification.findMany({ where: { workspaceId: ws.workspaceId, type: 'MISSING_PUNCH' } }));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ link: `/attendance/employees/${reportId}`, dedupeKey: `missing-punch:${reportId}:${tuesday}:MISSING_OUT` });
    expect(notes[0]!.body).toContain(tuesday);
    expect(notes[0]!.body).toContain('ອອກວຽກ');

    const again = await runAttendanceDaily(t.db, ws.workspaceId, new Date(now.getTime() + 15 * 60_000));
    expect(again.notified).toBe(0);
    expect(await t.db.tenant(ws.workspaceId, (tx) => tx.notification.count({ where: { workspaceId: ws.workspaceId, type: 'MISSING_PUNCH' } }))).toBe(1);
  });

  it('leaves today unjudged before the cutoff', async () => {
    const { ws, reportId } = await team();
    const monday = pastMonday();
    await punchDay(ws, reportId, monday, '08:00');
    const result = await runAttendanceDaily(t.db, ws.workspaceId, at(monday, '12:00'));
    expect(result.notified).toBe(0);
    const day = await t.db.tenant(ws.workspaceId, (tx) => tx.attendanceDay.findUnique({ where: { employeeId_workDate: { employeeId: reportId, workDate: parseIsoDate(monday) } } }));
    expect(day!.status).toBe('PRESENT');
  });
});
