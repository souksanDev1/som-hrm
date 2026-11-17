import { parseTimeOfDay, zonedInstant } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseIsoDate } from '../src/lib/dates';
import { recomputeAttendanceDays } from '../src/modules/attendance/attendance-days';
import { createPunches } from '../src/modules/attendance/punches';
import { api, bearer, createTestContext, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

/** Attendance backbone (A13): the single punch write path and the AttendanceDay recompute, on PostgreSQL. */
let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const TZ = 'Asia/Vientiane';
const at = (date: string, hhmm: string) => zonedInstant(date, parseTimeOfDay(hhmm)!, TZ);

const setup = async (overrides: Record<string, unknown> = {}) => {
  const ws = await createWorkspace(t.db);
  const token = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
  const res = await t.app.inject({ method: 'POST', url: api('/employees'), headers: bearer(token), payload: employeePayload(overrides) });
  expect(res.statusCode).toBe(201);
  return { ws, employeeId: res.json<{ employee: { id: string } }>().employee.id };
};
const dayOf = (ws: WorkspaceFixture, employeeId: string, date: string) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.attendanceDay.findUnique({ where: { employeeId_workDate: { employeeId, workDate: parseIsoDate(date) } } }));

describe('createPunches + recomputeAttendanceDays', () => {
  it('stores punches, computes the day from the standard schedule and ignores replayed client refs', async () => {
    const { ws, employeeId } = await setup();
    const now = at('2026-11-16', '18:00'); // Monday, standard 08:00–17:00 shift
    const punches = [
      { employeeId, kind: 'IN' as const, capturedAt: at('2026-11-16', '08:07'), source: 'MOBILE' as const, clientRef: 'dev-1' },
      { employeeId, kind: 'OUT' as const, capturedAt: at('2026-11-16', '17:02'), source: 'MOBILE' as const, clientRef: 'dev-2' },
    ];
    const first = await t.db.tenant(ws.workspaceId, (tx) => createPunches(tx, ws.workspaceId, punches, now));
    expect(first.created).toHaveLength(2);
    expect(first.recomputed.get(employeeId)).toEqual(['2026-11-16']);
    expect(await dayOf(ws, employeeId, '2026-11-16')).toMatchObject({ status: 'LATE', lateMinutes: 7, earlyLeaveMinutes: 0, workedMinutes: 475 });

    const replay = await t.db.tenant(ws.workspaceId, (tx) => createPunches(tx, ws.workspaceId, [...punches, punches[0]!], now));
    expect(replay.created).toHaveLength(0);
    expect(replay.replayed.map((p) => p.clientRef)).toEqual(['dev-1', 'dev-2', 'dev-1']);
    const count = await t.db.tenant(ws.workspaceId, (tx) => tx.attendancePunch.count({ where: { employeeId } }));
    expect(count).toBe(2);
  });

  it('puts night-shift punches on the start day through the roster (FR-ATT-17.2/17.3)', async () => {
    const { ws, employeeId } = await setup();
    await t.db.tenant(ws.workspaceId, async (tx) => {
      const night = await tx.shift.create({ data: { workspaceId: ws.workspaceId, name: 'Night', startTime: '22:00', endTime: '06:00', breakMinutes: 60 } });
      await tx.shiftRoster.create({ data: { workspaceId: ws.workspaceId, employeeId, date: parseIsoDate('2026-11-16'), shiftId: night.id } });
    });
    const { created } = await t.db.tenant(ws.workspaceId, (tx) =>
      createPunches(
        tx,
        ws.workspaceId,
        [
          { employeeId, kind: 'IN', capturedAt: at('2026-11-16', '21:58'), source: 'MOBILE' },
          { employeeId, kind: 'OUT', capturedAt: at('2026-11-17', '06:03'), source: 'MOBILE' },
        ],
        at('2026-11-17', '09:00'),
      ),
    );
    expect(created.map((p) => p.workDate.toISOString().slice(0, 10))).toEqual(['2026-11-16', '2026-11-16']);
    expect(await dayOf(ws, employeeId, '2026-11-16')).toMatchObject({ status: 'PRESENT', lateMinutes: 0, workedMinutes: 425 });
    expect(await dayOf(ws, employeeId, '2026-11-17')).toBeNull();
  });

  it('marks rest days, women-only holidays and absences', async () => {
    const { ws, employeeId } = await setup({ gender: 'MALE' });
    const woman = await (async () => {
      const token = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
      return (await t.app.inject({ method: 'POST', url: api('/employees'), headers: bearer(token), payload: employeePayload({ gender: 'FEMALE' }) })).json<{ employee: { id: string } }>().employee.id;
    })();
    await t.db.tenant(ws.workspaceId, (tx) =>
      tx.holiday.create({ data: { workspaceId: ws.workspaceId, date: parseIsoDate('2027-03-08'), nameLo: '8 ມີນາ', nameEn: 'Women', womenOnly: true } }),
    );
    const now = at('2027-03-09', '12:00');
    const run = (id: string, dates: string[]) => t.db.tenant(ws.workspaceId, (tx) => recomputeAttendanceDays(tx, ws.workspaceId, id, dates, now));
    // 2027-03-07 is a Sunday (rest), 2027-03-08 a Monday.
    const man = await run(employeeId, ['2027-03-07', '2027-03-08']);
    expect(man.get('2027-03-07')!.status).toBe('REST');
    expect(man.get('2027-03-08')!.status).toBe('ABSENT');
    expect((await run(woman, ['2027-03-08'])).get('2027-03-08')!.status).toBe('HOLIDAY');
  });

  it('leaves no row for a day too early to judge and drops a superseded punch from the calculation', async () => {
    const { ws, employeeId } = await setup();
    const morning = at('2026-11-18', '07:00');
    await t.db.tenant(ws.workspaceId, (tx) => recomputeAttendanceDays(tx, ws.workspaceId, employeeId, ['2026-11-18'], morning));
    expect(await dayOf(ws, employeeId, '2026-11-18')).toBeNull();

    const { created } = await t.db.tenant(ws.workspaceId, (tx) =>
      createPunches(tx, ws.workspaceId, [{ employeeId, kind: 'IN', capturedAt: at('2026-11-18', '09:00'), source: 'MOBILE' }], at('2026-11-18', '09:00')),
    );
    expect((await dayOf(ws, employeeId, '2026-11-18'))!.status).toBe('LATE');
    await t.db.tenant(ws.workspaceId, async (tx) => {
      await tx.attendancePunch.update({ where: { id: created[0]!.id }, data: { supersededAt: new Date() } });
      await createPunches(tx, ws.workspaceId, [{ employeeId, kind: 'IN', capturedAt: at('2026-11-18', '07:59'), source: 'CORRECTION', workDate: '2026-11-18' }], at('2026-11-18', '10:00'));
    });
    expect((await dayOf(ws, employeeId, '2026-11-18'))!).toMatchObject({ status: 'PRESENT', lateMinutes: 0 });
  });
});
