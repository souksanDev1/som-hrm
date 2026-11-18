import { isoDateInTimeZone, type ApprovalInboxItem, type ApprovalRequestDetail, type LeaveRequest, type Paginated } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runApprovalEscalation } from '../src/jobs';
import { parseIsoDate } from '../src/lib/dates';
import { recomputeAttendanceDays } from '../src/modules/attendance/attendance-days';
import { submitApproval } from '../src/modules/approvals/approvals.service';
import { defaultApprovalRegistry } from '../src/modules/approvals/registry';
import { leaveLedger } from '../src/modules/leave/leave-ledger';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

/** Leave approval & cancellation (FR-LV-11, FR-LV-12, FR-LV-13.10) on PostgreSQL. */
let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const PASSWORD = 'Person12345';
const today = () => isoDateInTimeZone('Asia/Vientiane');
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** A past Tuesday: a working day of the standard schedule with no punches (ABSENT before the leave is approved). */
const PAST_DAY = '2026-11-10';

interface Person {
  employeeId: string;
  userId: string;
  token: string;
}

let seq = 0;
const person = async (ws: WorkspaceFixture, managerId: string | null, role = 'EMPLOYEE', departmentId: string | null = null): Promise<Person> => {
  const n = ++seq;
  const emp = await t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: `L${n}`, firstName: 'ສົມ', lastName: `L${n}`, gender: 'MALE', hireDate: new Date('2020-01-01'),
        contractType: 'INDEFINITE', payType: 'MONTHLY', status: 'ACTIVE', managerId, departmentId,
      },
    }),
  );
  const email = `l${n}@${ws.code}.test`;
  const user = await createUser(t.db, ws, { email, password: PASSWORD, role, employeeId: emp.id });
  return { employeeId: emp.id, userId: user.id, token: (await loginAs(t.app, ws.code, email, PASSWORD)).accessToken };
};

/** worker → lead → head; `peer` also reports to head. */
const team = async () => {
  const ws = await createWorkspace(t.db);
  const head = await person(ws, null, 'MANAGER');
  const lead = await person(ws, head.employeeId, 'MANAGER');
  const peer = await person(ws, head.employeeId, 'MANAGER');
  const worker = await person(ws, lead.employeeId);
  return { ws, head, lead, peer, worker };
};

const annualId = async (ws: WorkspaceFixture) =>
  (await t.db.tenant(ws.workspaceId, (tx) => tx.leaveType.findFirstOrThrow({ where: { workspaceId: ws.workspaceId, code: 'ANNUAL' } }))).id;

const grant = async (ws: WorkspaceFixture, employeeId: string, year: number, days = 15) => {
  const leaveTypeId = await annualId(ws);
  await t.db.tenant(ws.workspaceId, (tx) => leaveLedger.post(tx, ws.workspaceId, { employeeId, leaveTypeId, periodYear: year, kind: 'ENTITLEMENT', days, effectiveDate: `${year}-01-01` }));
};

const balance = async (ws: WorkspaceFixture, employeeId: string, year: number) =>
  (await t.db.tenant(ws.workspaceId, async (tx) => leaveLedger.balanceByYear(tx, ws.workspaceId, employeeId, await annualId(ws), [year])))[year];

interface FileOpts {
  start?: string;
  end?: string;
  days?: number;
  halfDay?: 'NONE' | 'AM' | 'PM';
  reason?: string;
  submittedByUserId?: string | null;
  delegationId?: string | null;
}

/** Create a LeaveRequest and submit it for approval (what leave filing does); returns leave and approval ids. */
const fileLeave = async (ws: WorkspaceFixture, employeeId: string, o: FileOpts = {}) => {
  const leaveTypeId = await annualId(ws);
  const start = o.start ?? PAST_DAY;
  return t.db.tenant(ws.workspaceId, async (tx) => {
    const leave = await tx.leaveRequest.create({
      data: {
        workspaceId: ws.workspaceId, employeeId, leaveTypeId, startDate: parseIsoDate(start), endDate: parseIsoDate(o.end ?? start), days: o.days ?? 1,
        halfDay: o.halfDay ?? 'NONE', reason: o.reason ?? null, submittedByUserId: o.submittedByUserId ?? null, delegationId: o.delegationId ?? null,
      },
    });
    const req = await submitApproval(tx, defaultApprovalRegistry, {
      workspaceId: ws.workspaceId, subjectType: 'LEAVE', subjectId: leave.id, requesterEmployeeId: employeeId, submittedByUserId: o.submittedByUserId ?? null,
    });
    return { leaveId: leave.id, approvalId: req.id };
  });
};

const delegation = (ws: WorkspaceFixture, delegatorUserId: string, delegateUserId: string, from = today(), to = today()) =>
  t.db.tenant(ws.workspaceId, (tx) =>
    tx.approvalDelegation.create({ data: { workspaceId: ws.workspaceId, delegatorUserId, delegateUserId, startDate: parseIsoDate(from), endDate: parseIsoDate(to) } }),
  );

const setLevels = (ws: WorkspaceFixture, value: number) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.workspaceParameter.create({ data: { workspaceId: ws.workspaceId, key: 'approval.levels', value, effectiveFrom: new Date('2020-01-01') } }));

const get = (token: string, path: string) => t.app.inject({ method: 'GET', url: api(path), headers: bearer(token) });
const post = (token: string, path: string, payload: Record<string, unknown> = {}) => t.app.inject({ method: 'POST', url: api(path), headers: bearer(token), payload });
const approve = (token: string, id: string) => post(token, `/approvals/${id}/approve`);
const reject = (token: string, id: string, note = 'No') => post(token, `/approvals/${id}/reject`, { note });
const cancel = (token: string, leaveId: string, reason?: string) => post(token, `/leave/requests/${leaveId}/cancel`, reason === undefined ? {} : { reason });
const inbox = async (token: string) => (await get(token, '/approvals/inbox')).json<Paginated<ApprovalInboxItem>>();
const detail = async (token: string, id: string) => (await get(token, `/approvals/${id}`)).json<ApprovalRequestDetail>();

const leaveOf = (ws: WorkspaceFixture, id: string) => t.db.tenant(ws.workspaceId, (tx) => tx.leaveRequest.findUniqueOrThrow({ where: { id } }));
const ledgerOf = (ws: WorkspaceFixture, leaveRequestId: string) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.leaveLedgerEntry.findMany({ where: { leaveRequestId }, orderBy: { createdAt: 'asc' } }));
const dayStatus = async (ws: WorkspaceFixture, employeeId: string, date: string) =>
  (await t.db.tenant(ws.workspaceId, (tx) => tx.attendanceDay.findFirst({ where: { employeeId, workDate: parseIsoDate(date) } })))?.status ?? null;
const recompute = (ws: WorkspaceFixture, employeeId: string, date: string) =>
  t.db.tenant(ws.workspaceId, (tx) => recomputeAttendanceDays(tx, ws.workspaceId, employeeId, [date]));
const delegationActive = async (ws: WorkspaceFixture, id: string) =>
  (await t.db.tenant(ws.workspaceId, (tx) => tx.approvalDelegation.findUniqueOrThrow({ where: { id } }))).isActive;

describe('LEAVE approval (FR-LV-11)', () => {
  it('1 level: approval posts USAGE, turns the ABSENT day into LEAVE and tells the requester', async () => {
    const { ws, lead, worker } = await team();
    await grant(ws, worker.employeeId, 2026);
    await recompute(ws, worker.employeeId, PAST_DAY);
    expect(await dayStatus(ws, worker.employeeId, PAST_DAY)).toBe('ABSENT');

    const { leaveId, approvalId } = await fileLeave(ws, worker.employeeId, { reason: 'Family' });
    const item = (await inbox(lead.token)).items[0]!;
    expect(item).toMatchObject({ id: approvalId, subjectType: 'LEAVE' });
    expect(item.summary.title).toMatch(/ລາພັກປະຈຳປີ · 1/);
    expect(item.summary.detail).toBe(`${PAST_DAY} · Family`);

    expect((await approve(lead.token, approvalId)).statusCode).toBe(200);
    expect((await leaveOf(ws, leaveId)).status).toBe('APPROVED');
    expect((await ledgerOf(ws, leaveId)).map((e) => [e.kind, Number(e.days), e.periodYear])).toEqual([['USAGE', -1, 2026]]);
    expect(await balance(ws, worker.employeeId, 2026)).toBe(14);
    expect(await dayStatus(ws, worker.employeeId, PAST_DAY)).toBe('LEAVE');
    const notes = await t.db.tenant(ws.workspaceId, (tx) => tx.notification.findMany({ where: { userId: worker.userId, type: 'APPROVAL_DECISION' } }));
    expect(notes).toHaveLength(1);
  });

  it('2 levels: nothing is posted until the last level approves; half-day summary', async () => {
    const { ws, head, lead, worker } = await team();
    await setLevels(ws, 2);
    await grant(ws, worker.employeeId, 2026);
    const { leaveId, approvalId } = await fileLeave(ws, worker.employeeId, { halfDay: 'AM', days: 0.5 });
    expect((await detail(lead.token, approvalId)).summary.detail).toBe(`${PAST_DAY} (ເຄິ່ງມື້ເຊົ້າ)`);

    expect((await approve(lead.token, approvalId)).json<ApprovalRequestDetail>()).toMatchObject({ status: 'PENDING', currentStep: 2 });
    expect((await leaveOf(ws, leaveId)).status).toBe('PENDING');
    expect(await ledgerOf(ws, leaveId)).toHaveLength(0);

    expect((await approve(head.token, approvalId)).json<ApprovalRequestDetail>().status).toBe('APPROVED');
    expect((await leaveOf(ws, leaveId)).status).toBe('APPROVED');
    expect(await balance(ws, worker.employeeId, 2026)).toBe(14.5);
    expect(await dayStatus(ws, worker.employeeId, PAST_DAY)).toBe('LEAVE');
  });

  it('rejection marks the leave REJECTED, posts nothing and ends the absence delegation', async () => {
    const { ws, head, lead, worker } = await team();
    const d = await delegation(ws, lead.userId, worker.userId, PAST_DAY, PAST_DAY);
    const { leaveId, approvalId } = await fileLeave(ws, lead.employeeId, { delegationId: d.id });
    expect((await reject(head.token, approvalId, 'Busy week')).json<ApprovalRequestDetail>().status).toBe('REJECTED');
    expect((await leaveOf(ws, leaveId)).status).toBe('REJECTED');
    expect(await ledgerOf(ws, leaveId)).toHaveLength(0);
    expect(await delegationActive(ws, d.id)).toBe(false);
  });

  it('routes around a manager on approved leave (FR-ORG-04): their delegate decides, else the upper level', async () => {
    const { ws, head, lead, peer, worker } = await team();
    const y = Number(today().slice(0, 4));
    await grant(ws, lead.employeeId, y);
    await grant(ws, worker.employeeId, y);
    const d = await delegation(ws, lead.userId, peer.userId);
    // The lead's own leave covering today, approved by the head through the LEAVE handler.
    const own = await fileLeave(ws, lead.employeeId, { start: today(), delegationId: d.id });
    expect((await approve(head.token, own.approvalId)).statusCode).toBe(200);

    // With an active delegate the step stays with the lead and the delegate decides.
    const a = await fileLeave(ws, worker.employeeId, { start: addDays(today(), 20) });
    const step = (await detail(peer.token, a.approvalId)).steps[0]!;
    expect(step).toMatchObject({ approver: { userId: lead.userId }, delegate: { userId: peer.userId } });
    const decided = (await approve(peer.token, a.approvalId)).json<ApprovalRequestDetail>();
    expect(decided.status).toBe('APPROVED');
    expect(decided.steps[0]).toMatchObject({ actingAs: 'DELEGATE', decidedBy: { userId: peer.userId } });
    expect((await ledgerOf(ws, a.leaveId)).map((e) => e.kind)).toEqual(['USAGE']);

    // Without a delegate an approved leave makes routing skip the lead.
    await t.db.tenant(ws.workspaceId, (tx) => tx.approvalDelegation.update({ where: { id: d.id }, data: { isActive: false } }));
    const b = await fileLeave(ws, worker.employeeId, { start: addDays(today(), 21) });
    expect((await detail(head.token, b.approvalId)).steps[0]).toMatchObject({ approver: { userId: head.userId }, actingAs: 'UPPER_LEVEL' });

    // Once the lead's leave is cancelled (LEAVE_CANCEL approved), new requests reach the lead again.
    expect((await cancel(lead.token, own.leaveId, 'Trip cancelled')).statusCode).toBe(200);
    const leadCancel = (await inbox(head.token)).items.find((i) => i.subjectType === 'LEAVE_CANCEL')!;
    expect((await approve(head.token, leadCancel.id)).statusCode).toBe(200);
    const c = await fileLeave(ws, worker.employeeId, { start: addDays(today(), 22) });
    expect((await detail(lead.token, c.approvalId)).steps[0]).toMatchObject({ approver: { userId: lead.userId }, actingAs: 'MANAGER' });
  });

  it('escalation moves a stale leave step up and the upper level approval posts the usage', async () => {
    const { ws, head, lead, worker } = await team();
    await grant(ws, worker.employeeId, 2026);
    const { leaveId, approvalId } = await fileLeave(ws, worker.employeeId);
    const at = (isoDay: string) => new Date(`${isoDay}T02:00:00Z`);
    await t.db.tenant(ws.workspaceId, (tx) => tx.approvalStep.updateMany({ where: { requestId: approvalId }, data: { createdAt: at('2026-11-16') } }));
    expect((await runApprovalEscalation(t.db, ws.workspaceId, at('2026-11-19'))).escalated).toBe(1);
    expect((await approve(lead.token, approvalId)).statusCode).toBe(403);
    const d = (await approve(head.token, approvalId)).json<ApprovalRequestDetail>();
    expect(d.steps.map((s) => [s.decision, s.actingAs])).toEqual([['ESCALATED', 'MANAGER'], ['APPROVED', 'UPPER_LEVEL']]);
    expect((await leaveOf(ws, leaveId)).status).toBe('APPROVED');
    expect(await balance(ws, worker.employeeId, 2026)).toBe(14);
  });
});

describe('POST /leave/requests/:id/cancel (FR-LV-12)', () => {
  it('pending: withdrawn at once — approval CANCELLED and out of the inbox, step traceable, delegation ended, no ledger', async () => {
    const { ws, head, lead, worker } = await team();
    const d = await delegation(ws, lead.userId, worker.userId, PAST_DAY, PAST_DAY);
    const { leaveId, approvalId } = await fileLeave(ws, lead.employeeId, { delegationId: d.id });
    expect((await inbox(head.token)).total).toBe(1);

    const res = await cancel(lead.token, leaveId, 'Plans changed');
    expect(res.statusCode).toBe(200);
    expect(res.json<LeaveRequest>()).toMatchObject({ id: leaveId, status: 'CANCELLED', cancelReason: 'Plans changed', approvalRequestId: approvalId, cancelRequest: null });
    expect(res.json<LeaveRequest>().cancelledAt).not.toBeNull();

    expect((await inbox(head.token)).total).toBe(0);
    const det = await detail(head.token, approvalId);
    expect(det).toMatchObject({ status: 'CANCELLED', myCapacity: null });
    expect(det.decidedAt).not.toBeNull();
    expect(det.steps[0]).toMatchObject({ decision: 'PENDING', decidedBy: { userId: lead.userId }, note: 'Plans changed' });
    expect((await approve(head.token, approvalId)).statusCode).toBe(409);
    expect(await ledgerOf(ws, leaveId)).toHaveLength(0);
    expect(await delegationActive(ws, d.id)).toBe(false);
    const audit = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { action: { in: ['approval.withdraw', 'leave.cancel'] } } }));
    expect(audit.map((a) => a.action).sort()).toEqual(['approval.withdraw', 'leave.cancel']);

    // Already cancelled → 409; escalation ignores the withdrawn step.
    expect((await cancel(lead.token, leaveId)).json()).toMatchObject({ error: { code: 'leave_not_cancellable' } });
    await t.db.tenant(ws.workspaceId, (tx) => tx.approvalStep.updateMany({ where: { requestId: approvalId }, data: { createdAt: new Date('2026-11-02T02:00:00Z') } }));
    expect((await runApprovalEscalation(t.db, ws.workspaceId, new Date('2026-11-19T02:00:00Z'))).escalated).toBe(0);
  });

  it('approved: needs a reason, goes through LEAVE_CANCEL; approval gives the days back and recomputes attendance', async () => {
    const { ws, lead, worker } = await team();
    await grant(ws, worker.employeeId, 2026);
    const { leaveId, approvalId } = await fileLeave(ws, worker.employeeId);
    await approve(lead.token, approvalId);
    expect(await dayStatus(ws, worker.employeeId, PAST_DAY)).toBe('LEAVE');

    const noReason = await cancel(worker.token, leaveId);
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json()).toMatchObject({ error: { code: 'reason_required' } });

    const res = await cancel(worker.token, leaveId, 'Came to work');
    expect(res.statusCode).toBe(200);
    const view = res.json<LeaveRequest>();
    expect(view.status).toBe('APPROVED');
    expect(view.cancelRequest).toMatchObject({ status: 'PENDING', reason: 'Came to work' });
    expect(view.cancelRequest!.approvalRequestId).toBeTruthy();

    const double = await cancel(worker.token, leaveId, 'Again');
    expect(double.statusCode).toBe(409);
    expect(double.json()).toMatchObject({ error: { code: 'leave_cancel_pending' } });

    const item = (await inbox(lead.token)).items[0]!;
    expect(item).toMatchObject({ id: view.cancelRequest!.approvalRequestId, subjectType: 'LEAVE_CANCEL', link: `/approvals/${view.cancelRequest!.approvalRequestId}` });
    expect(item.summary.title).toMatch(/ລາພັກປະຈຳປີ · 1/);
    expect(item.summary.detail).toContain('Came to work');

    expect((await approve(lead.token, item.id)).json<ApprovalRequestDetail>().status).toBe('APPROVED');
    const leave = await leaveOf(ws, leaveId);
    expect(leave).toMatchObject({ status: 'CANCELLED', cancelReason: 'Came to work' });
    expect((await ledgerOf(ws, leaveId)).map((e) => [e.kind, Number(e.days)])).toEqual([['USAGE', -1], ['CANCEL', 1]]);
    expect(await balance(ws, worker.employeeId, 2026)).toBe(15);
    expect(await dayStatus(ws, worker.employeeId, PAST_DAY)).toBe('ABSENT');
    const cr = await t.db.tenant(ws.workspaceId, (tx) => tx.leaveCancelRequest.findFirstOrThrow({ where: { leaveRequestId: leaveId } }));
    expect(cr.status).toBe('APPROVED');
    expect(cr.decidedAt).not.toBeNull();
  });

  it('approved: a rejected cancellation keeps the leave and its usage; a new one may follow', async () => {
    const { ws, lead, worker } = await team();
    await grant(ws, worker.employeeId, 2026);
    const { leaveId, approvalId } = await fileLeave(ws, worker.employeeId);
    await approve(lead.token, approvalId);
    const first = (await cancel(worker.token, leaveId, 'Maybe')).json<LeaveRequest>();
    expect((await reject(lead.token, first.cancelRequest!.approvalRequestId!, 'Already planned')).statusCode).toBe(200);

    expect((await leaveOf(ws, leaveId)).status).toBe('APPROVED');
    expect(await balance(ws, worker.employeeId, 2026)).toBe(14);
    expect(await dayStatus(ws, worker.employeeId, PAST_DAY)).toBe('LEAVE');
    const again = await cancel(worker.token, leaveId, 'Really');
    expect(again.statusCode).toBe(200);
    expect(again.json<LeaveRequest>().cancelRequest).toMatchObject({ status: 'PENDING', reason: 'Really' });
  });

  it('rejected or cancelled leave cannot be cancelled', async () => {
    const { ws, lead, worker } = await team();
    const { leaveId, approvalId } = await fileLeave(ws, worker.employeeId);
    await reject(lead.token, approvalId);
    const res = await cancel(worker.token, leaveId, 'x');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'leave_not_cancellable' } });
  });

  it('allows the employee, the filer and HR (leave.manage); a manager gets 403, others 404; tenant isolation', async () => {
    const { ws, lead, peer, worker } = await team();
    const hr = await person(ws, null, 'HR_ADMIN');
    const outsider = await person(ws, null);

    const a = await fileLeave(ws, worker.employeeId);
    expect((await cancel(lead.token, a.leaveId)).statusCode).toBe(403); // can see the worker, may not cancel
    expect((await cancel(peer.token, a.leaveId)).statusCode).toBe(404); // outside their reporting line
    expect((await cancel(outsider.token, a.leaveId)).statusCode).toBe(404);
    expect((await cancel(hr.token, a.leaveId)).statusCode).toBe(200);

    // A manager who filed on behalf may cancel what they filed.
    const b = await fileLeave(ws, worker.employeeId, { submittedByUserId: lead.userId });
    expect((await cancel(lead.token, b.leaveId)).json<LeaveRequest>().status).toBe('CANCELLED');

    // Another workspace never sees the leave or its approval.
    const other = await createWorkspace(t.db);
    const ownerToken = (await loginAs(t.app, other.code, other.ownerEmail, OWNER_PASSWORD)).accessToken;
    const c = await fileLeave(ws, worker.employeeId);
    expect((await cancel(ownerToken, c.leaveId, 'x')).statusCode).toBe(404);
    expect((await get(ownerToken, `/approvals/${c.approvalId}`)).statusCode).toBe(404);
    expect((await leaveOf(ws, c.leaveId)).status).toBe('PENDING');
  });
});

describe('team members on leave in the approval detail (FR-LV-13.10)', () => {
  it('lists overlapping APPROVED / PENDING leave of the same manager or department, for approvers only', async () => {
    const { ws, head, lead, worker } = await team();
    const dept = await t.db.tenant(ws.workspaceId, (tx) => tx.department.create({ data: { workspaceId: ws.workspaceId, name: 'Ops' } }));
    await t.db.tenant(ws.workspaceId, (tx) => tx.employee.update({ where: { id: worker.employeeId }, data: { departmentId: dept.id } }));
    const sibling = await person(ws, lead.employeeId); // same manager
    const deptMate = await person(ws, head.employeeId, 'EMPLOYEE', dept.id); // same department, other manager
    const stranger = await person(ws, head.employeeId); // neither

    const mine = await fileLeave(ws, worker.employeeId, { start: '2026-12-07', end: '2026-12-09', days: 3 });
    const s1 = await fileLeave(ws, sibling.employeeId, { start: '2026-12-09', end: '2026-12-10', days: 2 });
    await approve(lead.token, s1.approvalId);
    const s2 = await fileLeave(ws, deptMate.employeeId, { start: '2026-12-01', end: '2026-12-07', halfDay: 'NONE', days: 5 });
    await fileLeave(ws, sibling.employeeId, { start: '2026-12-14' }); // no overlap
    await fileLeave(ws, stranger.employeeId, { start: '2026-12-08' }); // not in the team
    const withdrawn = await fileLeave(ws, sibling.employeeId, { start: '2026-12-08' });
    await cancel(sibling.token, withdrawn.leaveId);

    const forLead = await detail(lead.token, mine.approvalId);
    expect(forLead.teamOnLeave!.map((m) => [m.employeeId, m.startDate, m.endDate, m.status])).toEqual([
      [deptMate.employeeId, '2026-12-01', '2026-12-07', 'PENDING'],
      [sibling.employeeId, '2026-12-09', '2026-12-10', 'APPROVED'],
    ]);
    expect(forLead.teamOnLeave![0]).toMatchObject({ requestId: s2.leaveId, days: 5, halfDay: 'NONE' });
    expect(forLead.teamOnLeave![0]).not.toHaveProperty('leaveType');
    // The requester does not get the list.
    expect((await detail(worker.token, mine.approvalId)).teamOnLeave).toBeUndefined();

    // A cancellation request shows the same panel.
    await grant(ws, worker.employeeId, 2026);
    await approve(lead.token, mine.approvalId);
    const cr = (await cancel(worker.token, mine.leaveId, 'Not needed')).json<LeaveRequest>();
    expect((await detail(lead.token, cr.cancelRequest!.approvalRequestId!)).teamOnLeave!.map((m) => m.employeeId)).toEqual([deptMate.employeeId, sibling.employeeId]);
    // The sibling's own request lists the worker in return.
    expect((await detail(lead.token, s1.approvalId)).teamOnLeave!.map((m) => m.employeeId)).toEqual([worker.employeeId]);
  });
});
