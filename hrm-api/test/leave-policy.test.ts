import type { LeaveLedgerEntry, LeaveType } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runLeaveAccrual, runLeaveCarryOver } from '../src/jobs';
import { leaveLedger } from '../src/modules/leave/leave-ledger';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

/** Leave policy & ledger (M6 agent B: FR-LV-01, 02, 07, 08) on PostgreSQL. */
let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const PASSWORD = 'Person12345';
let seq = 0;

interface PersonOpts {
  managerId?: string | null;
  role?: string;
  hireDate?: string;
  payType?: 'MONTHLY' | 'DAILY' | 'HOURLY';
  hazardousWork?: boolean;
  status?: 'ACTIVE' | 'PROBATION' | 'RESIGNED';
  login?: boolean;
}

const person = async (ws: WorkspaceFixture, opts: PersonOpts = {}) => {
  const n = ++seq;
  const emp = await t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: `LP${n}`, firstName: 'ສົມ', lastName: `L${n}`, gender: 'MALE',
        hireDate: new Date(`${opts.hireDate ?? '2024-01-01'}T00:00:00.000Z`), contractType: 'INDEFINITE', payType: opts.payType ?? 'MONTHLY',
        status: opts.status ?? 'ACTIVE', hazardousWork: opts.hazardousWork ?? false, managerId: opts.managerId ?? null,
      },
    }),
  );
  if (opts.login === false) return { employeeId: emp.id, token: '' };
  const email = `lp${n}@${ws.code}.test`;
  await createUser(t.db, ws, { email, password: PASSWORD, role: opts.role ?? 'EMPLOYEE', employeeId: emp.id });
  return { employeeId: emp.id, token: (await loginAs(t.app, ws.code, email, PASSWORD)).accessToken };
};

const setup = async () => {
  const ws = await createWorkspace(t.db);
  const ownerToken = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
  const types = (await get(ownerToken, '/leave/types')).json<LeaveType[]>();
  const type = (code: string) => types.find((x) => x.code === code)!;
  return { ws, ownerToken, type };
};

const get = (token: string, path: string) => t.app.inject({ method: 'GET', url: api(path), headers: bearer(token) });
const send = (method: 'POST' | 'PUT', token: string, path: string, payload: object) => t.app.inject({ method, url: api(path), headers: bearer(token), payload });

/** PUT body from the current view, with overrides. */
const bodyOf = (v: LeaveType, over: Record<string, unknown> = {}, policy: Record<string, unknown> = {}) => ({
  nameLo: v.nameLo,
  nameEn: v.nameEn,
  paid: v.paid,
  requiresAttachment: v.requiresAttachment,
  allowHalfDay: v.allowHalfDay,
  isActive: v.isActive,
  policy: { ...v.policy, ...policy },
  ...over,
});

const customBody = (over: Record<string, unknown> = {}) => ({
  code: 'STUDY',
  nameLo: 'ລາຮຽນ',
  nameEn: 'Study leave',
  paid: false,
  requiresAttachment: false,
  allowHalfDay: true,
  isActive: true,
  countingMethod: 'WORKING_DAYS',
  quotaPeriod: 'YEARLY',
  policy: { daysPerYear: 5, minServiceDays: 0, minServicePayTypes: [] },
  ...over,
});

const at = (date: string) => new Date(`${date}T05:00:00.000Z`); // noon in Vientiane

describe('PUT /leave/types/:id (FR-LV-01)', () => {
  it('blocks values below the legal minimum with the field and minimum, saves valid ones and audits', async () => {
    const { ws, ownerToken, type } = await setup();
    const annual = type('ANNUAL');
    const low = await send('PUT', ownerToken, `/leave/types/${annual.id}`, bodyOf(annual, {}, { daysPerYear: 14 }));
    expect(low.statusCode).toBe(400);
    expect(low.json().error).toMatchObject({ code: 'below_legal_minimum', details: { field: 'daysPerYear', legalMin: 15 } });

    const lowHazard = await send('PUT', ownerToken, `/leave/types/${annual.id}`, bodyOf(annual, {}, { hazardousDays: 17 }));
    expect(lowHazard.json().error).toMatchObject({ code: 'below_legal_minimum', details: { field: 'hazardousDays', legalMin: 18 } });

    const maternity = type('MATERNITY');
    const lowBirth = await send('PUT', ownerToken, `/leave/types/${maternity.id}`, bodyOf(maternity, {}, { multipleBirthDays: 110 }));
    expect(lowBirth.json().error).toMatchObject({ code: 'below_legal_minimum', details: { field: 'multipleBirthDays', legalMin: 120 } });

    const ok = await send('PUT', ownerToken, `/leave/types/${annual.id}`, bodyOf(annual, { nameEn: 'Vacation' }, { daysPerYear: 16, hazardousDays: 20 }));
    expect(ok.statusCode).toBe(200);
    expect(ok.json<LeaveType>()).toMatchObject({ nameEn: 'Vacation', policy: { daysPerYear: 16, hazardousDays: 20, minServiceDays: 365 }, legalMin: { days: 15 } });

    const log = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findFirst({ where: { workspaceId: ws.workspaceId, action: 'leave_type.updated', entityId: annual.id } }));
    expect(log?.meta).toMatchObject({ code: 'ANNUAL', changes: { nameEn: { from: 'Annual leave', to: 'Vacation' }, 'policy.daysPerYear': { from: 15, to: 16 } } });
  });

  it('keeps code, category, quota period, counting method and gender of statutory types fixed', async () => {
    const { ownerToken, type } = await setup();
    const annual = type('ANNUAL');
    for (const locked of [{ category: 'OTHER' }, { quotaPeriod: 'PER_EVENT' }, { countingMethod: 'CALENDAR_DAYS' }, { gender: 'FEMALE' }, { code: 'X' }]) {
      const res = await send('PUT', ownerToken, `/leave/types/${annual.id}`, bodyOf(annual, locked));
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'leave_type_field_locked', details: { fields: Object.keys(locked) } });
    }
    // Same values are accepted (forms may send the whole object).
    const same = await send('PUT', ownerToken, `/leave/types/${annual.id}`, bodyOf(annual, { code: 'ANNUAL', category: 'ANNUAL', quotaPeriod: 'YEARLY', gender: null }));
    expect(same.statusCode).toBe(200);
  });
});

describe('POST /leave/types (FR-LV-02)', () => {
  it('creates a custom OTHER type, rejects a duplicate code and lets custom types change their counting', async () => {
    const { ws, ownerToken } = await setup();
    const res = await send('POST', ownerToken, '/leave/types', customBody({ category: 'ANNUAL' }));
    expect(res.statusCode).toBe(201);
    const created = res.json<LeaveType>();
    expect(created).toMatchObject({ code: 'STUDY', category: 'OTHER', isCustom: true, quotaPeriod: 'YEARLY', legalMin: null, policy: { daysPerYear: 5, hazardousDays: null } });
    expect(created.sortOrder).toBeGreaterThan(6);
    expect((await get(ownerToken, '/leave/types')).json<LeaveType[]>().map((x) => x.code)).toContain('STUDY');
    expect(await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.count({ where: { action: 'leave_type.created', entityId: created.id } }))).toBe(1);

    const dup = await send('POST', ownerToken, '/leave/types', customBody());
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('leave_type_code_taken');
    expect((await send('POST', ownerToken, '/leave/types', customBody({ code: 'bad code' }))).statusCode).toBe(400);

    const changed = await send('PUT', ownerToken, `/leave/types/${created.id}`, bodyOf(created, { quotaPeriod: 'PER_EVENT', countingMethod: 'CALENDAR_DAYS' }));
    expect(changed.statusCode).toBe(200);
    expect(changed.json<LeaveType>()).toMatchObject({ quotaPeriod: 'PER_EVENT', countingMethod: 'CALENDAR_DAYS' });
    expect((await send('PUT', ownerToken, `/leave/types/${created.id}`, bodyOf(created, { category: 'SICK' }))).json().error.code).toBe('leave_type_field_locked');
  });
});

describe('permissions and tenant isolation', () => {
  it('forbids employees and managers from changing types or adjusting balances', async () => {
    const { ws, type } = await setup();
    const manager = await person(ws, { role: 'MANAGER' });
    const worker = await person(ws, { managerId: manager.employeeId });
    const annual = type('ANNUAL');
    const adjust = { employeeId: worker.employeeId, leaveTypeId: annual.id, periodYear: 2030, days: 1, reason: 'x' };
    for (const token of [manager.token, worker.token]) {
      expect((await send('POST', token, '/leave/types', customBody())).statusCode).toBe(403);
      expect((await send('PUT', token, `/leave/types/${annual.id}`, bodyOf(annual))).statusCode).toBe(403);
      expect((await send('POST', token, '/leave/ledger/adjustments', adjust)).statusCode).toBe(403);
    }
  });

  it("never reaches another workspace's types, employees or ledger", async () => {
    const a = await setup();
    const b = await setup();
    const empA = await person(a.ws, { login: false });
    const annualA = a.type('ANNUAL');
    expect((await send('PUT', b.ownerToken, `/leave/types/${annualA.id}`, bodyOf(annualA))).statusCode).toBe(404);
    expect((await get(b.ownerToken, `/leave/ledger?employeeId=${empA.employeeId}`)).statusCode).toBe(404);
    const adjust = await send('POST', b.ownerToken, '/leave/ledger/adjustments', { employeeId: empA.employeeId, leaveTypeId: b.type('ANNUAL').id, periodYear: 2030, days: 1, reason: 'x' });
    expect(adjust.statusCode).toBe(404);
    const crossType = await send('POST', a.ownerToken, '/leave/ledger/adjustments', { employeeId: empA.employeeId, leaveTypeId: b.type('ANNUAL').id, periodYear: 2030, days: 1, reason: 'x' });
    expect(crossType.statusCode).toBe(404);
  });
});

describe('ledger (FR-LV-07)', () => {
  it('reads oneself, the reporting line, or anyone for HR; posts adjustments with a reason and audit', async () => {
    const { ws, ownerToken, type } = await setup();
    const manager = await person(ws, { role: 'MANAGER' });
    const worker = await person(ws, { managerId: manager.employeeId });
    const outsider = await person(ws);
    const annual = type('ANNUAL').id;
    const w = ws.workspaceId;
    await t.db.tenant(w, (tx) => leaveLedger.post(tx, w, { employeeId: worker.employeeId, leaveTypeId: annual, periodYear: 2030, kind: 'ENTITLEMENT', days: 15, effectiveDate: '2030-01-01' }));

    const base = { employeeId: worker.employeeId, leaveTypeId: annual, periodYear: 2030 };
    expect((await send('POST', ownerToken, '/leave/ledger/adjustments', { ...base, days: 1 })).statusCode).toBe(400);
    expect((await send('POST', ownerToken, '/leave/ledger/adjustments', { ...base, days: 1, reason: '   ' })).statusCode).toBe(400);
    expect((await send('POST', ownerToken, '/leave/ledger/adjustments', { ...base, days: 0.3, reason: 'x' })).statusCode).toBe(400);
    const adj = await send('POST', ownerToken, '/leave/ledger/adjustments', { ...base, days: -1.5, reason: ' Late sick note ' });
    expect(adj.statusCode).toBe(201);
    expect(adj.json<LeaveLedgerEntry>()).toMatchObject({ kind: 'ADJUST', days: -1.5, reason: 'Late sick note', createdByName: 'Owner', periodYear: 2030, effectiveDate: '2030-01-01' });
    const log = await t.db.tenant(w, (tx) => tx.auditLog.findFirst({ where: { workspaceId: w, action: 'leave_ledger.adjusted' } }));
    expect(log?.meta).toMatchObject({ employeeId: worker.employeeId, days: -1.5, reason: 'Late sick note' });

    const own = await get(worker.token, `/leave/ledger?year=2030`);
    expect(own.statusCode).toBe(200);
    expect(own.json<LeaveLedgerEntry[]>().map((e) => [e.kind, e.days, e.createdByName])).toEqual([
      ['ADJUST', -1.5, 'Owner'],
      ['ENTITLEMENT', 15, null],
    ]);
    expect((await get(manager.token, `/leave/ledger?employeeId=${worker.employeeId}&leaveTypeId=${annual}`)).statusCode).toBe(200);
    expect((await get(ownerToken, `/leave/ledger?employeeId=${outsider.employeeId}`)).statusCode).toBe(200);
    expect((await get(manager.token, `/leave/ledger?employeeId=${outsider.employeeId}`)).statusCode).toBe(404);
    expect((await get(worker.token, `/leave/ledger?employeeId=${outsider.employeeId}`)).statusCode).toBe(404);
    expect((await get(ownerToken, '/leave/ledger')).statusCode).toBe(404); // owner has no employee profile
    expect((await get(worker.token, '/leave/ledger?year=2031')).json()).toEqual([]);

    const balances = (await get(ownerToken, `/leave/balances?employeeId=${worker.employeeId}&year=2030`)).json<{ balances: { leaveTypeId: string; balance: number; adjusted: number }[] }>();
    expect(balances.balances.find((b) => b.leaveTypeId === annual)).toMatchObject({ balance: 13.5, adjusted: -1.5 });
  });
});

describe('leave-accrual job (FR-LV-07.1, Q10, Q15)', () => {
  it('grants yearly quotas from the grant date: anniversary in the year, 1 January afterwards, hazardous 18, sick 90 days for DAILY only; idempotent', async () => {
    const { ws, type } = await setup();
    const w = ws.workspaceId;
    const annual = type('ANNUAL').id;
    const sick = type('SICK').id;
    const a = await person(ws, { hireDate: '2029-06-10', login: false });
    const hazard = await person(ws, { hireDate: '2020-01-01', hazardousWork: true, login: false });
    const daily = await person(ws, { hireDate: '2030-03-01', payType: 'DAILY', login: false });
    const monthly = await person(ws, { hireDate: '2030-03-01', login: false });
    const resigned = await person(ws, { hireDate: '2020-01-01', status: 'RESIGNED', login: false });

    const grants = async () =>
      (await t.db.tenant(w, (tx) => tx.leaveLedgerEntry.findMany({ where: { workspaceId: w, kind: 'ENTITLEMENT' }, orderBy: [{ periodYear: 'asc' }, { effectiveDate: 'asc' }] }))).map((e) => ({
        who: [a, hazard, daily, monthly, resigned].findIndex((p) => p.employeeId === e.employeeId),
        type: e.leaveTypeId === annual ? 'ANNUAL' : e.leaveTypeId === sick ? 'SICK' : e.leaveTypeId,
        year: e.periodYear,
        days: Number(e.days),
        date: e.effectiveDate.toISOString().slice(0, 10),
      }));

    expect(await runLeaveAccrual(t.db, w, at('2030-04-01'))).toEqual({ granted: 4 });
    expect(await grants()).toEqual(
      expect.arrayContaining([
        { who: 1, type: 'ANNUAL', year: 2030, days: 18, date: '2030-01-01' },
        { who: 0, type: 'SICK', year: 2030, days: 30, date: '2030-01-01' },
        { who: 1, type: 'SICK', year: 2030, days: 30, date: '2030-01-01' },
        { who: 3, type: 'SICK', year: 2030, days: 30, date: '2030-03-01' },
      ]),
    );
    expect((await grants()).length).toBe(4);

    expect(await runLeaveAccrual(t.db, w, at('2030-06-10'))).toEqual({ granted: 2 });
    expect(await grants()).toEqual(
      expect.arrayContaining([
        { who: 0, type: 'ANNUAL', year: 2030, days: 15, date: '2030-06-10' },
        { who: 2, type: 'SICK', year: 2030, days: 30, date: '2030-05-30' },
      ]),
    );
    expect(await runLeaveAccrual(t.db, w, at('2030-06-10'))).toEqual({ granted: 0 });

    // New year: everyone eligible gets 1 January; the daily worker's first anniversary (2031-03-01) is still ahead.
    expect(await runLeaveAccrual(t.db, w, at('2031-01-01'))).toEqual({ granted: 6 });
    const y2031 = (await grants()).filter((g) => g.year === 2031);
    expect(y2031.every((g) => g.date === '2031-01-01')).toBe(true);
    expect(y2031.filter((g) => g.type === 'ANNUAL').map((g) => g.who).sort()).toEqual([0, 1]);
    expect(y2031.some((g) => g.who === 4)).toBe(false);
    expect(await runLeaveAccrual(t.db, w, at('2031-03-01'))).toEqual({ granted: 2 });
  });
});

describe('leave-carry-over job (SHOULD FR-LV-08)', () => {
  const setParam = (ws: WorkspaceFixture, key: string, value: number) =>
    t.db.tenant(ws.workspaceId, (tx) => tx.workspaceParameter.create({ data: { workspaceId: ws.workspaceId, key, value, effectiveFrom: new Date('2020-01-01') } }));

  it('carries nothing while leave.carryOverMaxDays is 0 (default)', async () => {
    const { ws, type } = await setup();
    const w = ws.workspaceId;
    const e = await person(ws, { login: false });
    await t.db.tenant(w, (tx) => leaveLedger.post(tx, w, { employeeId: e.employeeId, leaveTypeId: type('ANNUAL').id, periodYear: 2030, kind: 'ENTITLEMENT', days: 15, effectiveDate: '2030-01-01' }));
    expect(await runLeaveCarryOver(t.db, w, at('2031-01-02'))).toEqual({ carried: 0, expired: 0 });
    expect(await runLeaveCarryOver(t.db, w, at('2031-05-02'))).toEqual({ carried: 0, expired: 0 });
  });

  it('carries the unused annual balance up to the cap and expires what is unused after the expiry month', async () => {
    const { ws, type } = await setup();
    const w = ws.workspaceId;
    await setParam(ws, 'leave.carryOverMaxDays', 5);
    const annual = type('ANNUAL').id;
    const x = await person(ws, { login: false });
    const y = await person(ws, { login: false });
    const post = (employeeId: string, periodYear: number, kind: 'ENTITLEMENT' | 'USAGE', days: number, effectiveDate: string) =>
      t.db.tenant(w, (tx) => leaveLedger.post(tx, w, { employeeId, leaveTypeId: annual, periodYear, kind, days, effectiveDate }));
    await post(x.employeeId, 2030, 'ENTITLEMENT', 15, '2030-01-01');
    await post(x.employeeId, 2030, 'USAGE', -3, '2030-05-01');
    await post(y.employeeId, 2030, 'ENTITLEMENT', 15, '2030-01-01');
    await post(y.employeeId, 2030, 'USAGE', -13, '2030-07-01');
    // Sick leave is not carried.
    await t.db.tenant(w, (tx) => leaveLedger.post(tx, w, { employeeId: x.employeeId, leaveTypeId: type('SICK').id, periodYear: 2030, kind: 'ENTITLEMENT', days: 30, effectiveDate: '2030-01-01' }));

    expect(await runLeaveCarryOver(t.db, w, at('2030-12-31'))).toEqual({ carried: 0, expired: 0 });
    expect(await runLeaveCarryOver(t.db, w, at('2031-01-01'))).toEqual({ carried: 2, expired: 0 });
    expect(await runLeaveCarryOver(t.db, w, at('2031-01-02'))).toEqual({ carried: 0, expired: 0 });
    const balance = (id: string) => t.db.tenant(w, (tx) => leaveLedger.balanceByYear(tx, w, id, annual, [2031]));
    expect(await balance(x.employeeId)).toEqual({ 2031: 5 });
    expect(await balance(y.employeeId)).toEqual({ 2031: 2 });

    await post(x.employeeId, 2031, 'USAGE', -3, '2031-02-10');
    await post(x.employeeId, 2031, 'USAGE', -1, '2031-05-01'); // after expiry: does not save carried days
    expect(await runLeaveCarryOver(t.db, w, at('2031-03-31'))).toEqual({ carried: 0, expired: 0 });
    expect(await runLeaveCarryOver(t.db, w, at('2031-05-02'))).toEqual({ carried: 0, expired: 2 });
    expect(await runLeaveCarryOver(t.db, w, at('2031-05-03'))).toEqual({ carried: 0, expired: 0 });
    const expiries = await t.db.tenant(w, (tx) => tx.leaveLedgerEntry.findMany({ where: { workspaceId: w, kind: 'EXPIRE' }, orderBy: { days: 'asc' } }));
    expect(expiries.map((e) => [e.employeeId, Number(e.days), e.effectiveDate.toISOString().slice(0, 10)])).toEqual(
      expect.arrayContaining([
        [x.employeeId, -2, '2031-04-01'],
        [y.employeeId, -2, '2031-04-01'],
      ]),
    );
  });
});
