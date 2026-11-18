import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseIsoDate } from '../src/lib/dates';
import { loadLeaveDays, loadLeaveEmployee } from '../src/modules/leave/leave-days';
import { leaveLedger } from '../src/modules/leave/leave-ledger';
import { leaveTypesRepository, toLeaveTypeView } from '../src/modules/leave/leave-types.repository';
import { api, bearer, createTestContext, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD, type TestContext } from './helpers';

/** Leave backbone (A14): seeded types, day source for counting, and the balance ledger on PostgreSQL. */
let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const setup = async (overrides: Record<string, unknown> = {}) => {
  const ws = await createWorkspace(t.db);
  const token = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
  const res = await t.app.inject({ method: 'POST', url: api('/employees'), headers: bearer(token), payload: employeePayload(overrides) });
  expect(res.statusCode).toBe(201);
  const employeeId = res.json<{ employee: { id: string } }>().employee.id;
  const types = await t.db.tenant(ws.workspaceId, (tx) => leaveTypesRepository.list(tx, ws.workspaceId));
  const typeId = (code: string) => types.find((x) => x.code === code)!.id;
  return { ws, employeeId, types, typeId };
};

const holiday = (workspaceId: string, date: string, womenOnly = false) => ({
  workspaceId,
  date: parseIsoDate(date),
  nameLo: 'H',
  nameEn: 'H',
  kind: 'PUBLIC' as const,
  womenOnly,
});

describe('leave types seeded by bootstrap', () => {
  it('creates the statutory types with counting method, quota period, eligibility and legal minimum', async () => {
    const { types } = await setup();
    const view = types.map(toLeaveTypeView);
    expect(view.map((v) => v.code)).toEqual(['ANNUAL', 'SICK', 'MATERNITY', 'PERSONAL', 'MARRIAGE', 'BEREAVEMENT', 'UNPAID']);
    expect(view[0]).toMatchObject({ quotaPeriod: 'YEARLY', policy: { daysPerYear: 15, hazardousDays: 18, minServiceDays: 365 }, legalMin: { days: 15, hazardousDays: 18 } });
    expect(view[1]).toMatchObject({ policy: { minServiceDays: 90, minServicePayTypes: ['DAILY', 'HOURLY'] }, requiresAttachment: true });
    expect(view[2]).toMatchObject({ countingMethod: 'CALENDAR_DAYS', quotaPeriod: 'PER_EVENT', gender: 'FEMALE', policy: { daysPerYear: 105, multipleBirthDays: 120 } });
    expect(view[6]).toMatchObject({ quotaPeriod: 'UNLIMITED', legalMin: null });
  });
});

describe('loadLeaveDays', () => {
  it("uses the employee's schedule and holidays: Sunday off, women-only day off for women only", async () => {
    const { ws, employeeId } = await setup({ gender: 'FEMALE' });
    const male = await setup({ gender: 'MALE' });
    for (const s of [ws, male.ws]) {
      await t.db.tenant(s.workspaceId, (tx) =>
        tx.holiday.createMany({ data: [holiday(s.workspaceId, '2030-12-02'), holiday(s.workspaceId, '2030-12-04', true)] }),
      );
    }
    // Mon 2 Dec 2030 holiday, Wed 4 Dec women only, Sun 8 Dec rest day.
    const working = async (wsId: string, id: string) =>
      (await t.db.tenant(wsId, (tx) => loadLeaveDays(tx, wsId, id, '2030-12-02', '2030-12-08'))).filter((d) => d.working).map((d) => d.date);
    expect(await working(ws.workspaceId, employeeId)).toEqual(['2030-12-03', '2030-12-05', '2030-12-06', '2030-12-07']);
    expect(await working(male.ws.workspaceId, male.employeeId)).toEqual(['2030-12-03', '2030-12-04', '2030-12-05', '2030-12-06', '2030-12-07']);
  });

  it('loads the eligibility facts of the employee', async () => {
    const { ws, employeeId } = await setup({ gender: 'MALE', hireDate: '2025-03-01', payType: 'DAILY' });
    expect(await t.db.tenant(ws.workspaceId, (tx) => loadLeaveEmployee(tx, ws.workspaceId, employeeId))).toEqual({
      gender: 'MALE',
      hireDate: '2025-03-01',
      payType: 'DAILY',
      hazardousWork: false,
    });
  });
});

describe('leaveLedger', () => {
  it('grant → use → cancel → adjust sums to the balance and usage/cancel are idempotent (FR-LV-07)', async () => {
    const { ws, employeeId, typeId } = await setup();
    const w = ws.workspaceId;
    const annual = typeId('ANNUAL');
    const balance = () => t.db.tenant(w, (tx) => leaveLedger.balanceByYear(tx, w, employeeId, annual, [2030]));

    await t.db.tenant(w, (tx) => leaveLedger.post(tx, w, { employeeId, leaveTypeId: annual, periodYear: 2030, kind: 'ENTITLEMENT', days: 15, effectiveDate: '2030-01-01' }));
    await expect(
      t.db.tenant(w, (tx) => leaveLedger.post(tx, w, { employeeId, leaveTypeId: annual, periodYear: 2030, kind: 'ENTITLEMENT', days: 15, effectiveDate: '2030-01-01' })),
    ).rejects.toThrow();

    const req = await t.db.tenant(w, (tx) =>
      tx.leaveRequest.create({
        data: { workspaceId: w, employeeId, leaveTypeId: annual, startDate: parseIsoDate('2030-12-03'), endDate: parseIsoDate('2030-12-05'), days: 3, status: 'APPROVED' },
      }),
    );
    await t.db.tenant(w, (tx) => leaveLedger.postUsage(tx, w, req.id, null));
    await t.db.tenant(w, (tx) => leaveLedger.postUsage(tx, w, req.id, null));
    expect(await balance()).toEqual({ 2030: 12 });

    await t.db.tenant(w, (tx) => leaveLedger.postCancel(tx, w, req.id, '2030-12-10', null, 'plans changed'));
    await t.db.tenant(w, (tx) => leaveLedger.postCancel(tx, w, req.id, '2030-12-10', null, 'plans changed'));
    expect(await balance()).toEqual({ 2030: 15 });

    await t.db.tenant(w, (tx) => leaveLedger.post(tx, w, { employeeId, leaveTypeId: annual, periodYear: 2030, kind: 'ADJUST', days: -0.5, effectiveDate: '2030-06-01', reason: 'late approval' }));
    const [summary] = (await t.db.tenant(w, (tx) => leaveLedger.summaries(tx, w, employeeId, 2030))).filter((s) => s.leaveTypeId === annual);
    expect(summary).toMatchObject({ entitled: 15, used: 0, adjusted: -0.5, balance: 14.5, pending: 0 });
    expect((await t.db.tenant(w, (tx) => leaveLedger.entries(tx, w, employeeId, { leaveTypeId: annual }))).map((e) => e.kind)).toEqual([
      'CANCEL',
      'USAGE',
      'ADJUST',
      'ENTITLEMENT',
    ]);
  });

  it('splits usage and pending days of a request across New Year by leave year', async () => {
    const { ws, employeeId, typeId } = await setup();
    const w = ws.workspaceId;
    const annual = typeId('ANNUAL');
    // Mon 30 Dec 2030 – Fri 3 Jan 2031 (no holidays seeded for these years) → 2 + 3 working days.
    const mk = (status: 'APPROVED' | 'PENDING') =>
      t.db.tenant(w, (tx) =>
        tx.leaveRequest.create({
          data: { workspaceId: w, employeeId, leaveTypeId: annual, startDate: parseIsoDate('2030-12-30'), endDate: parseIsoDate('2031-01-03'), days: 5, status },
        }),
      );
    const pending = await mk('PENDING');
    expect(await t.db.tenant(w, (tx) => leaveLedger.pendingByYear(tx, w, employeeId, annual, [2030, 2031]))).toEqual({ 2030: 2, 2031: 3 });
    expect(await t.db.tenant(w, (tx) => leaveLedger.pendingByYear(tx, w, employeeId, annual, [2030, 2031], pending.id))).toEqual({ 2030: 0, 2031: 0 });

    const approved = await mk('APPROVED');
    await t.db.tenant(w, (tx) => leaveLedger.postUsage(tx, w, approved.id, null));
    expect(await t.db.tenant(w, (tx) => leaveLedger.balanceByYear(tx, w, employeeId, annual, [2030, 2031]))).toEqual({ 2030: -2, 2031: -3 });
  });
});
