import type { LeaveCalendarResponse } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseIsoDate } from '../src/lib/dates';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

/** Leave calendar (FR-LV-13.1–13.9) on PostgreSQL. Leave rows are inserted directly (filing/approval are other agents'). */
let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const PASSWORD = 'Person12345';
let seq = 0;

interface Person {
  employeeId: string;
  token: string;
}

const department = (ws: WorkspaceFixture, name: string) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.department.create({ data: { workspaceId: ws.workspaceId, name } }));

/** An employee with a login; `role` only matters for HR (the others are plain EMPLOYEE logins). */
const person = async (
  ws: WorkspaceFixture,
  opts: { departmentId?: string | null; managerId?: string | null; role?: string; name?: string } = {},
): Promise<Person> => {
  const n = ++seq;
  const emp = await t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: `C${n}`, firstName: opts.name ?? 'ສົມ', lastName: `P${n}`, gender: 'MALE',
        hireDate: new Date('2024-01-01'), contractType: 'INDEFINITE', payType: 'MONTHLY', status: 'ACTIVE',
        departmentId: opts.departmentId ?? null, managerId: opts.managerId ?? null,
      },
    }),
  );
  const email = `c${n}@${ws.code}.test`;
  await createUser(t.db, ws, { email, password: PASSWORD, role: opts.role ?? 'EMPLOYEE', employeeId: emp.id });
  return { employeeId: emp.id, token: (await loginAs(t.app, ws.code, email, PASSWORD)).accessToken };
};

const leaveTypeId = async (ws: WorkspaceFixture, code: string) =>
  (await t.db.tenant(ws.workspaceId, (tx) => tx.leaveType.findFirstOrThrow({ where: { workspaceId: ws.workspaceId, code } }))).id;

const leave = (
  ws: WorkspaceFixture,
  employeeId: string,
  typeId: string,
  opts: { start: string; end?: string; status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; halfDay?: 'NONE' | 'AM' | 'PM' },
) =>
  t.db.tenant(ws.workspaceId, (tx) =>
    tx.leaveRequest.create({
      data: {
        workspaceId: ws.workspaceId, employeeId, leaveTypeId: typeId, startDate: parseIsoDate(opts.start), endDate: parseIsoDate(opts.end ?? opts.start),
        halfDay: opts.halfDay ?? 'NONE', days: opts.halfDay && opts.halfDay !== 'NONE' ? 0.5 : 1, reason: 'secret reason', status: opts.status ?? 'APPROVED',
      },
    }),
  );

const calendar = async (token: string, query: Record<string, string>) =>
  t.app.inject({ method: 'GET', url: api(`/leave/calendar?${new URLSearchParams(query)}`), headers: bearer(token) });

const ok = async (token: string, query: Record<string, string>) => {
  const res = await calendar(token, query);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<LeaveCalendarResponse>();
};

const RANGE = { from: '2030-12-02', to: '2030-12-08' }; // Mon..Sun

/**
 * Org used by most tests:
 *   Sales: boss → lead → staff, peer (no manager in the tree), and `colleague` (reports to boss)
 *   Ops:   outsider (other department, not in anybody's tree)
 */
const org = async () => {
  const ws = await createWorkspace(t.db);
  const sales = await department(ws, 'Sales');
  const ops = await department(ws, 'Ops');
  const boss = await person(ws, { departmentId: sales.id, name: 'Boss' });
  const lead = await person(ws, { departmentId: ops.id, managerId: boss.employeeId, name: 'Lead' });
  const staff = await person(ws, { departmentId: ops.id, managerId: lead.employeeId, name: 'Staff' });
  const peer = await person(ws, { departmentId: sales.id, name: 'Peer' });
  const colleague = await person(ws, { departmentId: sales.id, managerId: boss.employeeId, name: 'Colleague' });
  const outsider = await person(ws, { departmentId: ops.id, name: 'Outsider' });
  const hr = await person(ws, { role: 'HR_ADMIN', name: 'Hr' });
  const annual = await leaveTypeId(ws, 'ANNUAL');
  const sick = await leaveTypeId(ws, 'SICK');
  return { ws, sales, ops, boss, lead, staff, peer, colleague, outsider, hr, annual, sick };
};

const names = (r: LeaveCalendarResponse) => r.entries.map((e) => e.employeeName.split(' ')[0]).sort();

describe('GET /leave/calendar — visibility', () => {
  it('regular employee: own department colleagues, approved only, leave type and reason hidden (FR-LV-13.1/13.6/13.7)', async () => {
    const o = await org();
    await leave(o.ws, o.colleague.employeeId, o.sick, { start: '2030-12-03' });
    await leave(o.ws, o.boss.employeeId, o.annual, { start: '2030-12-04', status: 'PENDING' });
    await leave(o.ws, o.boss.employeeId, o.annual, { start: '2030-12-05', status: 'REJECTED' });
    await leave(o.ws, o.colleague.employeeId, o.annual, { start: '2030-12-06', status: 'CANCELLED' });
    await leave(o.ws, o.outsider.employeeId, o.annual, { start: '2030-12-03' });

    const r = await ok(o.peer.token, RANGE);
    expect(names(r)).toEqual(['Colleague']);
    expect(r.entries[0]).toMatchObject({ status: 'APPROVED', leaveType: null, departmentId: o.sales.id });
    expect(JSON.stringify(r)).not.toContain('secret reason');
    expect(r.viewer).toEqual({ canSeeTypes: false, canSeePending: false, canFilter: false, allDepartments: false });
  });

  it('regular employee sees their own requests in full, pending included', async () => {
    const o = await org();
    await leave(o.ws, o.peer.employeeId, o.sick, { start: '2030-12-03', status: 'PENDING' });
    const r = await ok(o.peer.token, RANGE);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ status: 'PENDING', leaveType: { id: o.sick } });
  });

  it('manager: every level below (other departments too) with types and pending, own department approved only (FR-LV-13.4)', async () => {
    const o = await org();
    await leave(o.ws, o.staff.employeeId, o.sick, { start: '2030-12-03', status: 'PENDING' }); // 2 levels down, Ops
    await leave(o.ws, o.lead.employeeId, o.annual, { start: '2030-12-04' }); // 1 level down, Ops
    await leave(o.ws, o.peer.employeeId, o.annual, { start: '2030-12-05' }); // same department, not a report
    await leave(o.ws, o.peer.employeeId, o.annual, { start: '2030-12-06', status: 'PENDING' }); // hidden: pending of a non-report
    await leave(o.ws, o.outsider.employeeId, o.annual, { start: '2030-12-03' }); // hidden: other department, not a report

    const r = await ok(o.boss.token, RANGE);
    expect(names(r)).toEqual(['Lead', 'Peer', 'Staff']);
    const by = (n: string) => r.entries.find((e) => e.employeeName.startsWith(n))!;
    expect(by('Staff')).toMatchObject({ status: 'PENDING', leaveType: { id: o.sick } });
    expect(by('Lead').leaveType?.id).toBe(o.annual);
    expect(by('Peer').leaveType).toBeNull();
    expect(r.viewer).toEqual({ canSeeTypes: true, canSeePending: true, canFilter: true, allDepartments: false });

    // A middle manager sees only their own branch of the tree.
    const mid = await ok(o.lead.token, RANGE);
    expect(names(mid)).toContain('Staff');
    expect(names(mid)).not.toContain('Peer');
  });

  it('HR (leave.calendar.read_all): every department, types and pending (FR-LV-13.9)', async () => {
    const o = await org();
    await leave(o.ws, o.outsider.employeeId, o.annual, { start: '2030-12-03', status: 'PENDING' });
    await leave(o.ws, o.peer.employeeId, o.sick, { start: '2030-12-04' });
    await leave(o.ws, o.peer.employeeId, o.sick, { start: '2030-12-05', status: 'CANCELLED' });
    const r = await ok(o.hr.token, RANGE);
    expect(names(r)).toEqual(['Outsider', 'Peer']);
    expect(r.entries.every((e) => e.leaveType !== null)).toBe(true);
    expect(r.viewer.allDepartments).toBe(true);
  });

  it('filters by department and leave type for managers / HR only (FR-LV-13.5)', async () => {
    const o = await org();
    await leave(o.ws, o.staff.employeeId, o.sick, { start: '2030-12-03' });
    await leave(o.ws, o.lead.employeeId, o.annual, { start: '2030-12-04' });
    await leave(o.ws, o.peer.employeeId, o.sick, { start: '2030-12-05' });

    expect(names(await ok(o.hr.token, { ...RANGE, departmentId: o.ops.id }))).toEqual(['Lead', 'Staff']);
    expect(names(await ok(o.hr.token, { ...RANGE, leaveTypeId: o.sick }))).toEqual(['Peer', 'Staff']);
    // Manager filtering by type never matches people whose type they may not see (Peer).
    expect(names(await ok(o.boss.token, { ...RANGE, leaveTypeId: o.sick }))).toEqual(['Staff']);
    expect(names(await ok(o.boss.token, { ...RANGE, departmentId: o.sales.id }))).toEqual(['Peer']);

    const denied = await calendar(o.peer.token, { ...RANGE, departmentId: o.sales.id });
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ error: { code: string } }>().error.code).toBe('leave_calendar_filter_forbidden');
  });
});

describe('GET /leave/calendar — days', () => {
  it('returns half days and requests overlapping the range edges (FR-LV-13.2)', async () => {
    const o = await org();
    await leave(o.ws, o.colleague.employeeId, o.annual, { start: '2030-12-04', halfDay: 'PM' });
    await leave(o.ws, o.boss.employeeId, o.annual, { start: '2030-11-28', end: '2030-12-02' });
    await leave(o.ws, o.boss.employeeId, o.annual, { start: '2030-11-20', end: '2030-11-21' }); // outside
    const r = await ok(o.peer.token, RANGE);
    expect(r.entries.map((e) => [e.startDate, e.endDate, e.halfDay])).toEqual([
      ['2030-11-28', '2030-12-02', 'NONE'],
      ['2030-12-04', '2030-12-04', 'PM'],
    ]);
  });

  it('includes holidays (8 March women-only kept with its flag) and weekly rest days (FR-LV-13.8)', async () => {
    const o = await org();
    await t.db.tenant(o.ws.workspaceId, (tx) =>
      tx.holiday.createMany({
        data: [
          { workspaceId: o.ws.workspaceId, date: parseIsoDate('2030-03-08'), nameLo: 'ວັນແມ່ຍິງສາກົນ', nameEn: "International Women's Day", womenOnly: true },
          { workspaceId: o.ws.workspaceId, date: parseIsoDate('2030-03-12'), nameLo: 'ວັນຊາດໄທ', nameEn: 'Thai day', nationality: 'Thai' },
        ],
      }),
    );
    // A male employee still sees 8 March as a holiday entry, flagged women-only.
    const r = await ok(o.peer.token, { from: '2030-03-04', to: '2030-03-17' });
    expect(r.holidays).toEqual([
      { date: '2030-03-08', nameLo: 'ວັນແມ່ຍິງສາກົນ', nameEn: "International Women's Day", womenOnly: true, nationality: null },
      { date: '2030-03-12', nameLo: 'ວັນຊາດໄທ', nameEn: 'Thai day', womenOnly: false, nationality: 'Thai' },
    ]);
    // Bootstrap standard schedule: Monday–Saturday, Sunday off.
    expect(r.restDays).toEqual(['2030-03-10', '2030-03-17']);
    expect(r.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects ranges longer than 62 days and inverted ranges with 400', async () => {
    const o = await org();
    const long = await calendar(o.peer.token, { from: '2030-01-01', to: '2030-03-04' });
    expect(long.statusCode).toBe(400);
    expect(long.json<{ error: { code: string } }>().error.code).toBe('leave_calendar_range_too_long');
    expect((await calendar(o.peer.token, { from: '2030-01-01', to: '2030-03-03' })).statusCode).toBe(200);
    expect((await calendar(o.peer.token, { from: '2030-01-05', to: '2030-01-01' })).statusCode).toBe(400);
    expect((await calendar(o.peer.token, { from: '2030-01-01' })).statusCode).toBe(400);
  });
});

describe('GET /leave/calendar — tenant isolation', () => {
  it("never shows another workspace's leave, even to its owner, and ignores a foreign department filter", async () => {
    const a = await org();
    const b = await org();
    await leave(b.ws, b.peer.employeeId, b.annual, { start: '2030-12-03' });
    await leave(a.ws, a.peer.employeeId, a.annual, { start: '2030-12-03' });
    const owner = (await loginAs(t.app, a.ws.code, a.ws.ownerEmail, OWNER_PASSWORD)).accessToken;
    const r = await ok(owner, RANGE);
    expect(r.entries.map((e) => e.employeeId)).toEqual([a.peer.employeeId]);
    expect((await ok(owner, { ...RANGE, departmentId: b.sales.id })).entries).toEqual([]);
    expect((await ok(a.hr.token, { ...RANGE, leaveTypeId: b.annual })).entries).toEqual([]);
  });

  it('requires authentication', async () => {
    const res = await t.app.inject({ method: 'GET', url: api(`/leave/calendar?${new URLSearchParams(RANGE)}`) });
    expect(res.statusCode).toBe(401);
  });
});
