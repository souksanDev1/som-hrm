import {
  isoDateInTimeZone,
  type ApprovalInboxItem,
  type ApprovalRequestDetail,
  type ApprovalSubjectType,
  type Delegation,
  type DelegationList,
  type Paginated,
} from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type AppInstance } from '../src/app';
import { runApprovalEscalation } from '../src/jobs';
import { createApprovalRegistry, type ApprovalSubjectHandler } from '../src/modules/approvals/approval-handlers';
import { submitApproval } from '../src/modules/approvals/approvals.service';
import { ensureDelegationForAbsence } from '../src/modules/approvals/delegations.service';
import { defaultApprovalRegistry } from '../src/modules/approvals/registry';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const PASSWORD = 'Person12345';
const today = () => isoDateInTimeZone('Asia/Vientiane');
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

interface Person {
  employeeId: string;
  userId: string;
  token: string;
}

let seq = 0;
/** An employee (optionally reporting to `managerId`) with an EMPLOYEE login, signed in. */
const person = async (ws: WorkspaceFixture, managerId: string | null, role = 'EMPLOYEE'): Promise<Person> => {
  const n = ++seq;
  const emp = await t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: `A${n}`, firstName: 'ສົມ', lastName: `P${n}`, gender: 'MALE',
        hireDate: new Date('2024-01-01'), contractType: 'INDEFINITE', payType: 'MONTHLY', status: 'ACTIVE', managerId,
      },
    }),
  );
  const email = `p${n}@${ws.code}.test`;
  const user = await createUser(t.db, ws, { email, password: PASSWORD, role, employeeId: emp.id });
  const token = (await loginAs(t.app, ws.code, email, PASSWORD)).accessToken;
  return { employeeId: emp.id, userId: user.id, token };
};

/** Owner (holds approval.hr_fallback + approval.delegate.manage) with their own employee record. */
const owner = async (ws: WorkspaceFixture): Promise<Person> => {
  const user = await t.db.tenant(ws.workspaceId, (tx) => tx.user.findFirstOrThrow({ where: { email: ws.ownerEmail } }));
  const emp = await t.db.tenant(ws.workspaceId, (tx) =>
    tx.employee.create({
      data: {
        workspaceId: ws.workspaceId, employeeCode: `O${++seq}`, firstName: 'Owner', lastName: 'Boss', gender: 'FEMALE',
        hireDate: new Date('2020-01-01'), contractType: 'INDEFINITE', payType: 'MONTHLY', status: 'ACTIVE',
      },
    }),
  );
  await t.db.tenant(ws.workspaceId, (tx) => tx.user.update({ where: { id: user.id }, data: { employeeId: emp.id } }));
  return { employeeId: emp.id, userId: user.id, token: (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken };
};

/** Chain: worker → lead → head (head has no manager). */
const team = async () => {
  const ws = await createWorkspace(t.db);
  const head = await person(ws, null, 'MANAGER');
  const lead = await person(ws, head.employeeId, 'MANAGER');
  const worker = await person(ws, lead.employeeId);
  return { ws, head, lead, worker };
};

const leaveType = (ws: WorkspaceFixture) => t.db.tenant(ws.workspaceId, (tx) => tx.leaveType.findFirstOrThrow({ where: { workspaceId: ws.workspaceId, code: 'ANNUAL' } }));

/** File a one-day leave for `employeeId` and submit it for approval; returns the request id. */
const fileLeave = async (ws: WorkspaceFixture, employeeId: string, opts: { day?: string; reason?: string; now?: Date } = {}) => {
  const type = await leaveType(ws);
  const day = opts.day ?? addDays(today(), 30);
  return t.db.tenant(ws.workspaceId, async (tx) => {
    const leave = await tx.leaveRequest.create({
      data: { workspaceId: ws.workspaceId, employeeId, leaveTypeId: type.id, startDate: date(day), endDate: date(day), days: 1, reason: opts.reason ?? 'Family' },
    });
    const req = await submitApproval(tx, defaultApprovalRegistry, {
      workspaceId: ws.workspaceId, subjectType: 'LEAVE', subjectId: leave.id, requesterEmployeeId: employeeId, submittedByUserId: null, now: opts.now,
    });
    return req.id;
  });
};

/** Approved leave covering today (FR-ORG-04 "on leave"). */
const putOnLeave = async (ws: WorkspaceFixture, employeeId: string, from = today(), to = today()) => {
  const type = await leaveType(ws);
  await t.db.tenant(ws.workspaceId, (tx) =>
    tx.leaveRequest.create({ data: { workspaceId: ws.workspaceId, employeeId, leaveTypeId: type.id, startDate: date(from), endDate: date(to), days: 1, status: 'APPROVED' } }),
  );
};

const delegate = (ws: WorkspaceFixture, delegatorUserId: string, delegateUserId: string, from = today(), to = today()) =>
  t.db.tenant(ws.workspaceId, (tx) =>
    tx.approvalDelegation.create({ data: { workspaceId: ws.workspaceId, delegatorUserId, delegateUserId, startDate: date(from), endDate: date(to) } }),
  );

const setLevels = (ws: WorkspaceFixture, value: number) =>
  t.db.tenant(ws.workspaceId, (tx) =>
    tx.workspaceParameter.create({ data: { workspaceId: ws.workspaceId, key: 'approval.levels', value, effectiveFrom: new Date('2020-01-01') } }),
  );

const get = (token: string, path: string) => t.app.inject({ method: 'GET', url: api(path), headers: bearer(token) });
const send = (token: string, method: 'POST' | 'PATCH', path: string, payload: Record<string, unknown> = {}) =>
  t.app.inject({ method, url: api(path), headers: bearer(token), payload });
const approve = (token: string, id: string, note?: string) => send(token, 'POST', `/approvals/${id}/approve`, note ? { note } : {});
const reject = (token: string, id: string, note: string) => send(token, 'POST', `/approvals/${id}/reject`, { note });
const inbox = async (token: string) => (await get(token, '/approvals/inbox')).json<Paginated<ApprovalInboxItem>>();
const detail = async (token: string, id: string) => (await get(token, `/approvals/${id}`)).json<ApprovalRequestDetail>();

const notificationsOf = (ws: WorkspaceFixture, userId: string) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.notification.findMany({ where: { workspaceId: ws.workspaceId, userId }, orderBy: { createdAt: 'asc' } }));
const auditRows = (ws: WorkspaceFixture, action: string) =>
  t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { workspaceId: ws.workspaceId, action }, orderBy: { createdAt: 'asc' } }));
const leaveStatusOf = async (ws: WorkspaceFixture, requestId: string) =>
  t.db.tenant(ws.workspaceId, async (tx) => {
    const r = await tx.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
    return (await tx.leaveRequest.findUniqueOrThrow({ where: { id: r.subjectId } })).status;
  });

describe('chain of command routing (FR-ORG-02)', () => {
  it('routes to the direct manager, notifies them with a link and audits the submission', async () => {
    const { ws, head, lead, worker } = await team();
    const id = await fileLeave(ws, worker.employeeId, { reason: 'Wedding' });

    const box = await inbox(lead.token);
    expect(box.total).toBe(1);
    expect(box.items[0]).toMatchObject({ id, subjectType: 'LEAVE', level: 1, requiredLevels: 1, myCapacity: 'MANAGER', link: `/approvals/${id}` });
    expect(box.items[0]!.requester.employeeId).toBe(worker.employeeId);
    expect(box.items[0]!.summary.title).toMatch(/ລາພັກປະຈຳປີ · 1/);
    expect(box.items[0]!.summary.detail).toContain('Wedding');
    expect((await inbox(head.token)).total).toBe(0);
    expect((await inbox(worker.token)).total).toBe(0);

    const [n] = await notificationsOf(ws, lead.userId);
    expect(n).toMatchObject({ type: 'APPROVAL_PENDING', link: `/approvals/${id}` });
    expect(n!.body).toContain('P'); // requester name
    expect(await notificationsOf(ws, head.userId)).toHaveLength(0);
    expect((await auditRows(ws, 'approval.submit'))[0]).toMatchObject({ entity: 'ApprovalRequest', entityId: id });
  });

  it('approves at the last level, flips the leave, records MANAGER and tells the requester', async () => {
    const { ws, lead, worker } = await team();
    const id = await fileLeave(ws, worker.employeeId);
    const res = await approve(lead.token, id, 'Enjoy');
    expect(res.statusCode).toBe(200);
    const d = res.json<ApprovalRequestDetail>();
    expect(d).toMatchObject({ status: 'APPROVED', myCapacity: null });
    expect(d.steps).toHaveLength(1);
    expect(d.steps[0]).toMatchObject({ level: 1, decision: 'APPROVED', actingAs: 'MANAGER', note: 'Enjoy', decidedBy: { userId: lead.userId } });
    expect(await leaveStatusOf(ws, id)).toBe('APPROVED');

    const decision = (await notificationsOf(ws, worker.userId)).find((x) => x.type === 'APPROVAL_DECISION')!;
    expect(decision).toMatchObject({ link: `/approvals/${id}`, dedupeKey: `approval-decision:${id}` });
    expect((await auditRows(ws, 'approval.approve'))[0]!.meta).toMatchObject({ capacity: 'MANAGER', level: 1 });
    // The requester sees the outcome and history of their own request.
    expect((await detail(worker.token, id)).steps[0]!.actingAs).toBe('MANAGER');
  });

  it('walks up `approval.levels` levels and completes at the top of the chain', async () => {
    const { ws, head, lead, worker } = await team();
    await setLevels(ws, 3);
    const id = await fileLeave(ws, worker.employeeId);

    const first = (await approve(lead.token, id)).json<ApprovalRequestDetail>();
    expect(first).toMatchObject({ status: 'PENDING', currentStep: 2, requiredLevels: 3 });
    expect(first.steps[1]).toMatchObject({ level: 2, decision: 'PENDING', actingAs: 'MANAGER', approver: { userId: head.userId } });
    expect((await inbox(head.token)).items[0]).toMatchObject({ id, level: 2, requiredLevels: 3 });
    expect((await notificationsOf(ws, head.userId))[0]!.type).toBe('APPROVAL_PENDING');
    expect(await leaveStatusOf(ws, id)).toBe('PENDING');

    // Head has no manager: level 3 does not exist, so the head's approval is final.
    const done = (await approve(head.token, id)).json<ApprovalRequestDetail>();
    expect(done.status).toBe('APPROVED');
    expect(done.steps.map((s) => [s.level, s.decision])).toEqual([[1, 'APPROVED'], [2, 'APPROVED']]);
  });

  it('routes a requester without a manager to HR fallback users, never to themselves', async () => {
    const ws = await createWorkspace(t.db);
    const boss = await owner(ws); // OWNER: holds approval.hr_fallback
    const hrEmp = await person(ws, null, 'HR_ADMIN');
    const id = await fileLeave(ws, boss.employeeId);

    expect((await inbox(boss.token)).total).toBe(0);
    const box = await inbox(hrEmp.token);
    expect(box.items[0]).toMatchObject({ id, myCapacity: 'HR' });
    expect((await notificationsOf(ws, hrEmp.userId))[0]!.type).toBe('APPROVAL_PENDING');
    expect(await notificationsOf(ws, boss.userId)).toHaveLength(0);

    expect((await approve(boss.token, id)).statusCode).toBe(403);
    const d = (await approve(hrEmp.token, id)).json<ApprovalRequestDetail>();
    expect(d.status).toBe('APPROVED');
    expect(d.steps[0]).toMatchObject({ approver: null, actingAs: 'HR', decidedBy: { userId: hrEmp.userId } });
  });

  it('survives a cycle in the reporting lines', async () => {
    const ws = await createWorkspace(t.db);
    const a = await person(ws, null);
    const b = await person(ws, a.employeeId);
    await t.db.tenant(ws.workspaceId, (tx) => tx.employee.update({ where: { id: a.employeeId }, data: { managerId: b.employeeId } }));
    const id = await fileLeave(ws, a.employeeId);
    expect((await inbox(b.token)).items[0]).toMatchObject({ id, myCapacity: 'MANAGER' });
  });
});

describe('delegates and absent managers (FR-ORG-03, FR-ORG-04)', () => {
  it('skips a manager on approved leave without a delegate to the next level (UPPER_LEVEL)', async () => {
    const { ws, head, lead, worker } = await team();
    await putOnLeave(ws, lead.employeeId);
    const id = await fileLeave(ws, worker.employeeId);
    expect((await inbox(lead.token)).total).toBe(0);
    expect((await inbox(head.token)).items[0]).toMatchObject({ id, myCapacity: 'UPPER_LEVEL' });
    const d = (await approve(head.token, id)).json<ApprovalRequestDetail>();
    expect(d.steps[0]).toMatchObject({ actingAs: 'UPPER_LEVEL', approver: { userId: head.userId } });
  });

  it('skips managers whose login is disabled or who left, and sends the top to HR', async () => {
    const { ws, head, lead, worker } = await team();
    await t.db.tenant(ws.workspaceId, (tx) => tx.user.update({ where: { id: lead.userId }, data: { isActive: false } }));
    const id1 = await fileLeave(ws, worker.employeeId);
    expect((await detail(head.token, id1)).steps[0]).toMatchObject({ approver: { userId: head.userId }, actingAs: 'UPPER_LEVEL' });

    await t.db.tenant(ws.workspaceId, (tx) => tx.employee.update({ where: { id: head.employeeId }, data: { status: 'RESIGNED' } }));
    const id2 = await fileLeave(ws, worker.employeeId);
    const boss = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    expect((await detail(boss.accessToken, id2)).steps[0]).toMatchObject({ approver: null, actingAs: 'HR' });
  });

  it('lets an active delegate decide for the manager and records DELEGATE (FR-ORG-06)', async () => {
    const { ws, head, lead, worker } = await team();
    const deputy = await person(ws, head.employeeId);
    await putOnLeave(ws, lead.employeeId);
    await delegate(ws, lead.userId, deputy.userId);
    const id = await fileLeave(ws, worker.employeeId);

    expect((await inbox(head.token)).total).toBe(0);
    expect((await inbox(deputy.token)).items[0]).toMatchObject({ id, myCapacity: 'DELEGATE' });
    expect((await notificationsOf(ws, deputy.userId))[0]!.type).toBe('APPROVAL_PENDING');

    const d = (await approve(deputy.token, id)).json<ApprovalRequestDetail>();
    expect(d.steps[0]).toMatchObject({
      approver: { userId: lead.userId }, delegate: { userId: deputy.userId }, actingAs: 'DELEGATE', decidedBy: { userId: deputy.userId },
    });
    expect((await auditRows(ws, 'approval.approve'))[0]!.meta).toMatchObject({ capacity: 'DELEGATE', onBehalfOfUserId: lead.userId });
  });

  it('shows already-routed requests to a delegate appointed later; the manager can still act', async () => {
    const { ws, lead, worker } = await team();
    const deputy = await person(ws, null);
    const id = await fileLeave(ws, worker.employeeId);
    expect((await inbox(deputy.token)).total).toBe(0);
    await delegate(ws, lead.userId, deputy.userId);
    expect((await inbox(deputy.token)).items[0]).toMatchObject({ id, myCapacity: 'DELEGATE' });
    expect((await inbox(lead.token)).items[0]).toMatchObject({ id, myCapacity: 'MANAGER' });
  });

  it('ignores a delegation that is cancelled, not yet started, or to the requester', async () => {
    const { ws, lead, worker } = await team();
    const deputy = await person(ws, null);
    const cancelled = await delegate(ws, lead.userId, deputy.userId);
    await t.db.tenant(ws.workspaceId, (tx) => tx.approvalDelegation.update({ where: { id: cancelled.id }, data: { isActive: false } }));
    await delegate(ws, lead.userId, deputy.userId, addDays(today(), 5), addDays(today(), 6));
    await putOnLeave(ws, lead.employeeId);
    await fileLeave(ws, worker.employeeId);
    expect((await inbox(deputy.token)).total).toBe(0);

    const ws2 = await team();
    await delegate(ws2.ws, ws2.lead.userId, ws2.worker.userId);
    const id = await fileLeave(ws2.ws, ws2.worker.employeeId);
    expect((await detail(ws2.lead.token, id)).steps[0]).toMatchObject({ approver: { userId: ws2.lead.userId }, delegate: null });
    expect((await inbox(ws2.worker.token)).total).toBe(0);
  });

  it('resolves delegates and absences again for every level', async () => {
    const { ws, head, lead, worker } = await team();
    const deputy = await person(ws, null);
    await setLevels(ws, 2);
    const id = await fileLeave(ws, worker.employeeId);
    await delegate(ws, head.userId, deputy.userId);
    await approve(lead.token, id);
    expect((await detail(lead.token, id)).steps[1]).toMatchObject({ level: 2, approver: { userId: head.userId }, delegate: { userId: deputy.userId } });
  });
});

describe('deciding (FR-ORG-06, optimistic concurrency)', () => {
  it('rejects with a mandatory note and tells the requester why', async () => {
    const { ws, lead, worker } = await team();
    const id = await fileLeave(ws, worker.employeeId);
    expect((await send(lead.token, 'POST', `/approvals/${id}/reject`, {})).statusCode).toBe(400);
    const d = (await reject(lead.token, id, 'No cover that week')).json<ApprovalRequestDetail>();
    expect(d).toMatchObject({ status: 'REJECTED' });
    expect(d.steps[0]).toMatchObject({ decision: 'REJECTED', note: 'No cover that week' });
    expect(await leaveStatusOf(ws, id)).toBe('REJECTED');
    const n = (await notificationsOf(ws, worker.userId)).find((x) => x.type === 'APPROVAL_DECISION')!;
    expect(n.body).toContain('No cover that week');
  });

  it('hides requests from outsiders (404) and refuses the requester and past approvers (403)', async () => {
    const { ws, head, lead, worker } = await team();
    const stranger = await person(ws, null);
    const id = await fileLeave(ws, worker.employeeId);
    expect((await get(stranger.token, `/approvals/${id}`)).statusCode).toBe(404);
    expect((await approve(stranger.token, id)).statusCode).toBe(404);
    expect((await get(head.token, `/approvals/${id}`)).statusCode).toBe(404);
    const own = await approve(worker.token, id);
    expect(own.statusCode).toBe(403);
    expect(own.json().error.code).toBe('approval_not_allowed');
    expect((await detail(worker.token, id)).myCapacity).toBeNull();

    expect((await approve(lead.token, id)).statusCode).toBe(200);
    const again = await reject(lead.token, id, 'changed my mind');
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('approval_already_decided');
  });

  it('lets exactly one of two concurrent approvers decide', async () => {
    const { ws, lead, worker } = await team();
    const deputy = await person(ws, null);
    await delegate(ws, lead.userId, deputy.userId);
    const id = await fileLeave(ws, worker.employeeId);

    const results = await Promise.all([approve(lead.token, id), reject(deputy.token, id, 'race')]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.statusCode === 409)!;
    expect(loser.json().error.code).toBe('approval_already_decided');

    const steps = await t.db.tenant(ws.workspaceId, (tx) => tx.approvalStep.findMany({ where: { requestId: id } }));
    expect(steps).toHaveLength(1);
    expect(steps[0]!.decision).not.toBe('PENDING');
    const audits = [...(await auditRows(ws, 'approval.approve')), ...(await auditRows(ws, 'approval.reject'))];
    expect(audits).toHaveLength(1);
    const decisions = (await notificationsOf(ws, worker.userId)).filter((x) => x.type === 'APPROVAL_DECISION');
    expect(decisions).toHaveLength(1);
  });

  it('isolates tenants: another workspace never sees or decides the request (RLS)', async () => {
    const a = await team();
    const b = await team();
    const id = await fileLeave(a.ws, a.worker.employeeId);
    expect((await get(b.lead.token, `/approvals/${id}`)).statusCode).toBe(404);
    expect((await approve(b.lead.token, id)).statusCode).toBe(404);
    expect((await inbox(b.lead.token)).total).toBe(0);
    const leaked = await t.db.tenant(b.ws.workspaceId, (tx) => tx.approvalRequest.findMany({ where: { id } }));
    expect(leaked).toHaveLength(0);
    const leakedSteps = await t.db.tenant(b.ws.workspaceId, (tx) => tx.approvalStep.findMany({ where: { requestId: id } }));
    expect(leakedSteps).toHaveLength(0);
  });
});

describe('subject handler registry', () => {
  it('runs the handler hooks of any subject type and uses its summary and link', async () => {
    const calls: string[] = [];
    const overtime: ApprovalSubjectHandler = {
      subjectType: 'OVERTIME' as ApprovalSubjectType,
      summarize: async (_tx, _ws, ids) => new Map(ids.map((id) => [id, { title: `OT ${id}`, detail: '2 h' }])),
      onApproved: async (_tx, o) => void calls.push(`approved:${o.subjectId}`),
      onRejected: async (_tx, o) => void calls.push(`rejected:${o.subjectId}:${o.note}`),
      link: (r) => `/overtime/${r.subjectId}`,
    };
    const registry = createApprovalRegistry([overtime]);
    expect(() => createApprovalRegistry([overtime, overtime])).toThrow(/Duplicate/);
    const app: AppInstance = await buildApp({ env: (await import('./env')).testEnv(), db: t.db, logger: false, approvalRegistry: registry });
    await app.ready();
    try {
      const { ws, lead, worker } = await team();
      const ids = await t.db.tenant(ws.workspaceId, async (tx) => [
        (await submitApproval(tx, registry, { workspaceId: ws.workspaceId, subjectType: 'OVERTIME', subjectId: 'ot-1', requesterEmployeeId: worker.employeeId, submittedByUserId: worker.userId })).id,
        (await submitApproval(tx, registry, { workspaceId: ws.workspaceId, subjectType: 'OVERTIME', subjectId: 'ot-2', requesterEmployeeId: worker.employeeId, submittedByUserId: worker.userId })).id,
      ]);
      const box = (await app.inject({ method: 'GET', url: api('/approvals/inbox'), headers: bearer(lead.token) })).json<Paginated<ApprovalInboxItem>>();
      expect(box.items.map((i) => [i.summary.title, i.link])).toEqual([['OT ot-1', '/overtime/ot-1'], ['OT ot-2', '/overtime/ot-2']]);
      await app.inject({ method: 'POST', url: api(`/approvals/${ids[0]}/approve`), headers: bearer(lead.token), payload: {} });
      await app.inject({ method: 'POST', url: api(`/approvals/${ids[1]}/reject`), headers: bearer(lead.token), payload: { note: 'no' } });
      expect(calls).toEqual(['approved:ot-1', 'rejected:ot-2:no']);
      expect((await notificationsOf(ws, lead.userId))[0]!.link).toBe('/overtime/ot-1');
      // A type without a handler cannot be submitted.
      await expect(
        t.db.tenant(ws.workspaceId, (tx) =>
          submitApproval(tx, registry, { workspaceId: ws.workspaceId, subjectType: 'LEAVE', subjectId: 'x', requesterEmployeeId: worker.employeeId, submittedByUserId: null }),
        ),
      ).rejects.toThrow(/No approval handler/);
    } finally {
      await app.close();
    }
  });
});

describe('delegations (FR-ORG-03.1)', () => {
  const create = (token: string, body: Record<string, unknown>) => send(token, 'POST', '/approvals/delegations', body);

  it('lets a manager appoint, edit and cancel a delegate, auditing every change', async () => {
    const { ws, lead, worker } = await team();
    const deputy = await person(ws, null);
    const start = today();
    const res = await create(lead.token, { delegateUserId: deputy.userId, startDate: start, endDate: addDays(start, 3), reason: 'Training' });
    expect(res.statusCode).toBe(201);
    const d = res.json<Delegation>();
    expect(d).toMatchObject({ delegator: { userId: lead.userId }, delegate: { userId: deputy.userId }, status: 'ACTIVE', reason: 'Training' });

    const list = (await get(lead.token, '/approvals/delegations')).json<DelegationList>();
    expect(list).toMatchObject({ canDelegate: true, canManageAll: false });
    expect(list.items.map((i) => i.id)).toEqual([d.id]);
    // The delegate sees it too; a worker without reports may not delegate.
    expect((await get(deputy.token, '/approvals/delegations')).json<DelegationList>().items).toHaveLength(1);
    expect((await get(worker.token, '/approvals/delegations')).json<DelegationList>()).toMatchObject({ canDelegate: false, items: [] });

    const later = addDays(start, 10);
    const upd = await send(lead.token, 'PATCH', `/approvals/delegations/${d.id}`, { delegateUserId: deputy.userId, startDate: later, endDate: addDays(later, 2) });
    expect(upd.json<Delegation>()).toMatchObject({ startDate: later, status: 'SCHEDULED', reason: null });
    const cancel = await send(lead.token, 'POST', `/approvals/delegations/${d.id}/cancel`);
    expect(cancel.json<Delegation>().status).toBe('CANCELLED');
    expect((await send(lead.token, 'POST', `/approvals/delegations/${d.id}/cancel`)).json().error.code).toBe('delegation_closed');

    const [created] = await auditRows(ws, 'approval.delegation.create');
    expect(created).toMatchObject({ entity: 'ApprovalDelegation', entityId: d.id, actorUserId: lead.userId });
    expect(created!.meta).toMatchObject({ delegatorUserId: lead.userId, delegateUserId: deputy.userId, startDate: start });
    expect((await auditRows(ws, 'approval.delegation.update'))[0]!.meta).toMatchObject({ old: { startDate: start }, new: { startDate: later } });
    expect(await auditRows(ws, 'approval.delegation.cancel')).toHaveLength(1);
  });

  it('rejects self-delegation, overlapping ranges, past ranges and inactive or foreign delegates', async () => {
    const { ws, lead } = await team();
    const deputy = await person(ws, null);
    const other = await person(ws, null);
    const s = today();
    const self = await create(lead.token, { delegateUserId: lead.userId, startDate: s, endDate: s });
    expect(self.json().error).toMatchObject({ code: 'delegation_self', details: { field: 'delegateUserId' } });

    expect((await create(lead.token, { delegateUserId: deputy.userId, startDate: s, endDate: addDays(s, 5) })).statusCode).toBe(201);
    const overlap = await create(lead.token, { delegateUserId: other.userId, startDate: addDays(s, 5), endDate: addDays(s, 9) });
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json().error.code).toBe('delegation_overlap');
    expect((await create(lead.token, { delegateUserId: other.userId, startDate: addDays(s, 6), endDate: addDays(s, 9) })).statusCode).toBe(201);

    expect((await create(lead.token, { delegateUserId: other.userId, startDate: addDays(s, -5), endDate: addDays(s, -1) })).json().error.code).toBe('delegation_in_past');
    expect((await create(lead.token, { delegateUserId: other.userId, startDate: addDays(s, 30), endDate: addDays(s, 29) })).json().error.code).toBe('validation_error');

    await t.db.tenant(ws.workspaceId, (tx) => tx.user.update({ where: { id: other.userId }, data: { isActive: false } }));
    expect((await create(lead.token, { delegateUserId: other.userId, startDate: addDays(s, 40), endDate: addDays(s, 41) })).json().error.code).toBe('delegate_invalid');
    const foreign = await team();
    expect((await create(lead.token, { delegateUserId: foreign.lead.userId, startDate: addDays(s, 40), endDate: addDays(s, 41) })).json().error.code).toBe('delegate_invalid');
  });

  it('serialises concurrent overlapping creates: only one wins', async () => {
    const { ws, lead } = await team();
    const a = await person(ws, null);
    const b = await person(ws, null);
    const body = (u: string) => ({ delegateUserId: u, startDate: today(), endDate: addDays(today(), 2) });
    const res = await Promise.all([create(lead.token, body(a.userId)), create(lead.token, body(b.userId))]);
    expect(res.map((r) => r.statusCode).sort()).toEqual([201, 409]);
  });

  it('allows only managers to delegate for themselves and HR (approval.delegate.manage) for others', async () => {
    const { ws, lead, worker } = await team();
    const deputy = await person(ws, null);
    const body = { delegateUserId: deputy.userId, startDate: today(), endDate: today() };
    const notManager = await create(worker.token, body);
    expect(notManager.statusCode).toBe(403);
    expect(notManager.json().error.code).toBe('not_a_manager');
    expect((await create(worker.token, { ...body, delegatorUserId: lead.userId })).statusCode).toBe(403);

    const boss = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
    const forLead = await create(boss, { ...body, delegatorUserId: lead.userId });
    expect(forLead.statusCode).toBe(201);
    expect(forLead.json<Delegation>().delegator.userId).toBe(lead.userId);
    expect((await create(boss, { ...body, delegatorUserId: worker.userId })).json().error.code).toBe('not_a_manager');
    const all = (await get(boss, '/approvals/delegations')).json<DelegationList>();
    expect(all).toMatchObject({ canDelegate: true, canManageAll: true });
    expect(all.items).toHaveLength(1);
    // Only the delegator or HR may change it.
    expect((await send(deputy.token, 'POST', `/approvals/delegations/${forLead.json<Delegation>().id}/cancel`)).statusCode).toBe(404);
  });

  it('lists active users other than the caller as candidates', async () => {
    const { ws, head, lead, worker } = await team();
    const res = (await get(lead.token, '/approvals/delegate-candidates')).json<{ userId: string; isManager: boolean }[]>();
    const ids = res.map((c) => c.userId);
    expect(ids).toEqual(expect.arrayContaining([head.userId, worker.userId]));
    expect(ids).not.toContain(lead.userId);
    expect(res.find((c) => c.userId === head.userId)!.isManager).toBe(true);
    expect(res.find((c) => c.userId === worker.userId)!.isManager).toBe(false);
    void ws;
  });
});

describe('delegate for a manager’s own absence (FR-ORG-03.2)', () => {
  const absence = (token: string, body: Record<string, unknown>) => send(token, 'POST', '/approvals/delegations/absence', body);

  it('asks for a delegate, creates it for the leave period, then reports it as covered', async () => {
    const { ws, lead, worker } = await team();
    const deputy = await person(ws, null);
    const from = addDays(today(), 7);
    const to = addDays(today(), 9);
    expect((await absence(lead.token, { startDate: from, endDate: to })).json()).toEqual({ needsDelegate: true, delegation: null });

    const made = (await absence(lead.token, { startDate: from, endDate: to, delegateUserId: deputy.userId })).json();
    expect(made).toMatchObject({ needsDelegate: false, delegation: { delegate: { userId: deputy.userId }, startDate: from, endDate: to, status: 'SCHEDULED' } });
    expect((await auditRows(ws, 'approval.delegation.create'))[0]!.meta).toMatchObject({ source: 'absence' });

    const inside = (await absence(lead.token, { startDate: addDays(from, 1), endDate: to })).json();
    expect(inside).toMatchObject({ needsDelegate: false, delegation: { id: made.delegation.id } });
    // Partly covered: a new delegation would overlap the existing one.
    expect((await absence(lead.token, { startDate: to, endDate: addDays(to, 3), delegateUserId: deputy.userId })).json().error.code).toBe('delegation_overlap');
    // Employees without reports never need a delegate.
    expect((await absence(worker.token, { startDate: from, endDate: to })).json()).toEqual({ needsDelegate: false, delegation: null });
  });

  it('is callable inside the leave-filing transaction (M6), and the delegation then routes requests', async () => {
    const { ws, lead, worker } = await team();
    const deputy = await person(ws, null);
    const result = await t.db.tenant(ws.workspaceId, (tx) =>
      ensureDelegationForAbsence(tx, ws.workspaceId, lead.userId, { managerEmployeeId: lead.employeeId, startDate: today(), endDate: today(), delegateUserId: deputy.userId }),
    );
    expect(result.delegation?.status).toBe('ACTIVE');
    await putOnLeave(ws, lead.employeeId);
    const id = await fileLeave(ws, worker.employeeId);
    expect((await inbox(deputy.token)).items[0]).toMatchObject({ id, myCapacity: 'DELEGATE' });
  });
});

describe('escalation job (FR-ORG-05)', () => {
  /** Thursday 2026-11-19 09:00 in Vientiane. */
  const at = (isoDay: string) => new Date(`${isoDay}T02:00:00Z`);
  const ageStep = (ws: WorkspaceFixture, requestId: string, isoDay: string) =>
    t.db.tenant(ws.workspaceId, (tx) => tx.approvalStep.updateMany({ where: { requestId, decision: 'PENDING' }, data: { createdAt: at(isoDay) } }));
  const steps = (ws: WorkspaceFixture, requestId: string) =>
    t.db.tenant(ws.workspaceId, (tx) => tx.approvalStep.findMany({ where: { requestId }, orderBy: { createdAt: 'asc' } }));

  it('escalates after 2 full working days, one level up, and notifies the new approver and HR once', async () => {
    const { ws, head, lead, worker } = await team();
    const boss = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    const id = await fileLeave(ws, worker.employeeId);
    await ageStep(ws, id, '2026-11-16'); // Monday

    // Wednesday: only Tuesday has passed.
    expect(await runApprovalEscalation(t.db, ws.workspaceId, at('2026-11-18'))).toEqual({ escalated: 0, notifications: 0 });
    // Thursday: Tuesday + Wednesday.
    const res = await runApprovalEscalation(t.db, ws.workspaceId, at('2026-11-19'));
    expect(res).toEqual({ escalated: 1, notifications: 2 });
    const [old, next] = await steps(ws, id);
    expect(old).toMatchObject({ decision: 'ESCALATED', approverUserId: lead.userId, decidedByUserId: null });
    expect(next).toMatchObject({ decision: 'PENDING', level: 1, approverUserId: head.userId, actingAs: 'UPPER_LEVEL', chainIndex: 1 });

    const escalatedTo = (userId: string) => notificationsOf(ws, userId).then((rows) => rows.filter((r) => r.type === 'APPROVAL_ESCALATED'));
    expect(await escalatedTo(head.userId)).toHaveLength(1);
    expect((await escalatedTo(boss.user.id))[0]).toMatchObject({ link: `/approvals/${id}` });
    expect((await auditRows(ws, 'approval.escalate'))[0]!.meta).toMatchObject({ level: 1, workingDays: 2, from: { approverUserId: lead.userId } });

    // Re-running is harmless (the new step is fresh).
    expect(await runApprovalEscalation(t.db, ws.workspaceId, at('2026-11-19'))).toEqual({ escalated: 0, notifications: 0 });
    // The old approver can no longer decide; the upper level can, as UPPER_LEVEL.
    expect((await approve(lead.token, id)).statusCode).toBe(403);
    const d = (await approve(head.token, id)).json<ApprovalRequestDetail>();
    expect(d.steps.map((s) => [s.decision, s.actingAs])).toEqual([['ESCALATED', 'MANAGER'], ['APPROVED', 'UPPER_LEVEL']]);
  });

  it('does not count holidays or rest days, and follows the escalationWorkingDays parameter', async () => {
    const { ws, worker } = await team();
    const id = await fileLeave(ws, worker.employeeId);
    await ageStep(ws, id, '2026-11-16'); // Monday
    await t.db.tenant(ws.workspaceId, (tx) => tx.holiday.create({ data: { workspaceId: ws.workspaceId, date: date('2026-11-17'), nameLo: 'ບຸນ', nameEn: 'Festival' } }));
    expect((await runApprovalEscalation(t.db, ws.workspaceId, at('2026-11-19'))).escalated).toBe(0);
    expect((await runApprovalEscalation(t.db, ws.workspaceId, at('2026-11-20'))).escalated).toBe(1);

    const ws2 = await team();
    const id2 = await fileLeave(ws2.ws, ws2.worker.employeeId);
    await ageStep(ws2.ws, id2, '2026-11-20'); // Friday; Sunday 22 is a rest day (Mon–Sat standard)
    expect((await runApprovalEscalation(t.db, ws2.ws.workspaceId, at('2026-11-23'))).escalated).toBe(0); // Sat only
    expect((await runApprovalEscalation(t.db, ws2.ws.workspaceId, at('2026-11-24'))).escalated).toBe(1); // Sat + Mon

    const ws3 = await team();
    await t.db.tenant(ws3.ws.workspaceId, (tx) =>
      tx.workspaceParameter.create({ data: { workspaceId: ws3.ws.workspaceId, key: 'approval.escalationWorkingDays', value: 3, effectiveFrom: new Date('2020-01-01') } }),
    );
    const id3 = await fileLeave(ws3.ws, ws3.worker.employeeId);
    await ageStep(ws3.ws, id3, '2026-11-16');
    expect((await runApprovalEscalation(t.db, ws3.ws.workspaceId, at('2026-11-19'))).escalated).toBe(0);
    expect((await runApprovalEscalation(t.db, ws3.ws.workspaceId, at('2026-11-20'))).escalated).toBe(1);
  });

  it('escalates the top of the chain to HR and never escalates an HR step again', async () => {
    const { ws, head, lead } = await team();
    const boss = await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD);
    const id = await fileLeave(ws, lead.employeeId); // lead → head (top)
    await ageStep(ws, id, '2026-11-16');
    expect((await runApprovalEscalation(t.db, ws.workspaceId, at('2026-11-19'))).escalated).toBe(1);
    const [, hrStep] = await steps(ws, id);
    expect(hrStep).toMatchObject({ approverUserId: null, actingAs: 'HR' });
    await ageStep(ws, id, '2026-11-16');
    expect((await runApprovalEscalation(t.db, ws.workspaceId, at('2026-11-30'))).escalated).toBe(0);
    expect((await inbox(boss.accessToken)).items[0]).toMatchObject({ id, myCapacity: 'HR' });
    void head;
  });
});

describe('permissions', () => {
  it('grants approval.hr_fallback and approval.delegate.manage to OWNER and HR_ADMIN only', async () => {
    const ws = await createWorkspace(t.db);
    const rows = await t.db.tenant(ws.workspaceId, (tx) =>
      tx.role.findMany({ where: { workspaceId: ws.workspaceId }, include: { permissions: { include: { permission: true } } } }),
    );
    const has = (code: string, key: string) => rows.find((r) => r.code === code)!.permissions.some((p) => p.permission.key === key);
    for (const key of ['approval.hr_fallback', 'approval.delegate.manage']) {
      expect([has('OWNER', key), has('HR_ADMIN', key), has('MANAGER', key), has('EMPLOYEE', key)]).toEqual([true, true, false, false]);
    }
  });
});
