import {
  approvalCapacityOf,
  isoDateInTimeZone,
  PERMISSIONS,
  resolveApprover,
  translate,
  type ApprovalCapacity,
  type ApprovalChainMember,
  type ApprovalInboxItem,
  type ApprovalInboxQuery,
  type ApprovalRequestDetail,
  type ApprovalSubjectType,
  type ApprovalSummary,
  type Locale,
  type Paginated,
  type ResolveApproverOptions,
} from '@hrm/shared';
import type { Db, Tx } from '../../db/client';
import { parseIsoDate, toWorkDate } from '../../lib/dates';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { notify } from '../notifications/notifications.service';
import { parametersRepository } from '../parameters/parameters.repository';
import { parameterReader } from '../parameters/parameters.service';
import { handlerFor, type ApprovalHandlerRegistry } from './approval-handlers';
import { approvalsRepository as repo, type ApprovalRequestRow, type ApprovalStepRow } from './approvals.repository';
import { workingDaysBetween } from './working-days';

interface RequestMeta {
  ip?: string;
}

const ENDED_STATUSES = ['RESIGNED', 'TERMINATED'];
const toLocale = (value: string): Locale => (value === 'en' ? 'en' : 'lo');
const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

const workspaceToday = async (tx: Tx, workspaceId: string, now: Date) => {
  const timeZone = await parametersRepository.workspaceTimezone(tx, workspaceId);
  return { timeZone, today: isoDateInTimeZone(timeZone, now) };
};

// ───────────────────────────── Routing ─────────────────────────────

/** The requester's chain plus leave / delegation lookups for `date`, ready for `resolveApprover`. */
const loadRouting = async (tx: Tx, workspaceId: string, requesterEmployeeId: string, date: string) => {
  const rows = await repo.chainOf(tx, workspaceId, requesterEmployeeId);
  const day = parseIsoDate(date);
  const chain: ApprovalChainMember[] = rows.map((r) => ({
    employeeId: r.employeeId,
    userId: r.userId,
    active: !!r.userActive && !ENDED_STATUSES.includes(r.status),
  }));
  const onLeave = await repo.onLeave(tx, workspaceId, rows.map((r) => r.employeeId), day);
  const delegations = await repo.activeDelegationsOf(tx, workspaceId, rows.flatMap((r) => (r.userId ? [r.userId] : [])), day);
  const delegates = new Map((await repo.usersByIds(tx, workspaceId, delegations.map((d) => d.delegateUserId))).map((u) => [u.id, u.isActive]));
  const byDelegator = new Map(delegations.map((d) => [d.delegatorUserId, { userId: d.delegateUserId, active: delegates.get(d.delegateUserId) ?? false }]));
  return {
    chain,
    leaveLookup: (employeeId: string) => onLeave.has(employeeId),
    delegationLookup: (userId: string) => byDelegator.get(userId) ?? null,
  };
};

/**
 * Create the step that handles `level` today (FR-ORG-02/03/04), resolving delegates and absences
 * at that moment. Null when the chain ended and the request is complete (`completeWhenChainEnds`).
 * The step is stamped with the engine's `now`, the timeline escalation measures its age on.
 */
const routeLevel = async (
  tx: Tx,
  workspaceId: string,
  request: { id: string; requesterEmployeeId: string },
  level: number,
  clock: { today: string; now: Date },
  opts: ResolveApproverOptions,
) => {
  const routing = await loadRouting(tx, workspaceId, request.requesterEmployeeId, clock.today);
  const resolved = resolveApprover(routing.chain, clock.today, routing.leaveLookup, routing.delegationLookup, opts);
  if (resolved.kind === 'none') return null;
  const base = { workspaceId, requestId: request.id, level, createdAt: clock.now };
  return repo.createStep(
    tx,
    resolved.kind === 'hr'
      ? { ...base, chainIndex: null, approverUserId: null, delegateUserId: null, actingAs: 'HR' }
      : { ...base, chainIndex: resolved.chainIndex, approverUserId: resolved.approverUserId, delegateUserId: resolved.delegateUserId, actingAs: resolved.actingAs },
  );
};

/** The requester's own login and everyone who already decided a step never act again on the request. */
const excludedUsers = (requesterUserId: string | null, steps: readonly { decidedByUserId: string | null }[]) => [
  ...(requesterUserId ? [requesterUserId] : []),
  ...steps.flatMap((s) => (s.decidedByUserId ? [s.decidedByUserId] : [])),
];

/** Who is told a step waits for them: the manager and their delegate, or every HR fallback user. */
const stepRecipients = async (tx: Tx, workspaceId: string, step: { approverUserId: string | null; delegateUserId: string | null }, requesterUserId: string | null) =>
  step.approverUserId
    ? [step.approverUserId, ...(step.delegateUserId ? [step.delegateUserId] : [])]
    : (await repo.hrFallbackUserIds(tx, workspaceId)).filter((id) => id !== requesterUserId);

interface NotifyContext {
  workspaceId: string;
  request: { id: string; subjectType: ApprovalSubjectType; subjectId: string };
  requesterName: string;
  link: string;
}

const notifyPending = (tx: Tx, c: NotifyContext, stepId: string, userIds: string[]) =>
  notify(tx, {
    workspaceId: c.workspaceId,
    userIds,
    type: 'APPROVAL_PENDING',
    titleKey: 'notif.approvalPending.title',
    bodyKey: 'notif.approvalPending.body',
    params: { requester: c.requesterName, subject: { t: `approval.subject.${c.request.subjectType}` } },
    link: c.link,
    dedupeKey: `approval-pending:${stepId}`,
    data: { requestId: c.request.id, stepId },
  });

// ───────────────────────────── Engine API (used by subject modules) ─────────────────────────────

export interface SubmitApprovalInput {
  workspaceId: string;
  subjectType: ApprovalSubjectType;
  /** Id of the subject row (e.g. the LeaveRequest). One request per subject. */
  subjectId: string;
  requesterEmployeeId: string;
  /** Who filed it (the employee, or HR on their behalf); null for the system. */
  submittedByUserId: string | null;
  ip?: string;
  now?: Date;
}

/**
 * Start approval of a subject inside the caller's transaction (FR-ORG-02): routes level 1 along the
 * requester's chain of command (or to HR, also when the subject's handler asks for `routing: 'hr'`) and
 * notifies the approver (FR-NOTI-03.1).
 */
export const submitApproval = async (tx: Tx, registry: ApprovalHandlerRegistry, input: SubmitApprovalInput) => {
  const { workspaceId } = input;
  const handler = handlerFor(registry, input.subjectType);
  const now = input.now ?? new Date();
  const { today } = await workspaceToday(tx, workspaceId, now);
  const requiredLevels = await parameterReader.workspace(tx, workspaceId, 'approval.levels', parseIsoDate(today));
  const requester = await tx.employee.findFirstOrThrow({
    where: { id: input.requesterEmployeeId, workspaceId },
    select: { firstName: true, lastName: true },
  });
  const request = await repo.createRequest(tx, {
    workspaceId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    requesterEmployeeId: input.requesterEmployeeId,
    requiredLevels,
    submittedByUserId: input.submittedByUserId,
  });
  const requesterUser = await repo.userOfEmployee(tx, workspaceId, input.requesterEmployeeId);
  const step =
    handler.routing === 'hr'
      ? await repo.createStep(tx, { workspaceId, requestId: request.id, level: 1, createdAt: now, chainIndex: null, approverUserId: null, delegateUserId: null, actingAs: 'HR' })
      : (await routeLevel(tx, workspaceId, request, 1, { today, now }, { excludeUserIds: excludedUsers(requesterUser?.id ?? null, []) }))!;

  const recipients = await stepRecipients(tx, workspaceId, step, requesterUser?.id ?? null);
  await notifyPending(tx, { workspaceId, request, requesterName: fullName(requester), link: handler.link(request) }, step.id, recipients);
  await auditRepository.create(tx, {
    workspaceId,
    actorUserId: input.submittedByUserId,
    action: 'approval.submit',
    entity: 'ApprovalRequest',
    entityId: request.id,
    meta: {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      requiredLevels,
      step: { id: step.id, level: 1, approverUserId: step.approverUserId, delegateUserId: step.delegateUserId, actingAs: step.actingAs },
    },
    ip: input.ip,
  });
  return request;
};

export interface WithdrawApprovalInput {
  workspaceId: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  /** Who withdrew it (the requester, the filer or HR); null for the system. */
  actorUserId: string | null;
  note?: string | null;
  ip?: string;
  now?: Date;
}

/**
 * Withdraw the PENDING approval of a subject inside the caller's transaction (e.g. leave cancelled before a
 * decision, FR-LV-12.1): the request becomes CANCELLED and its pending step is closed with who withdrew it, so the
 * history stays traceable. No handler hook runs — the subject module updates its own row. Returns null when the
 * subject has no approval request; 409 `approval_already_decided` when it is no longer pending.
 */
export const withdrawApproval = async (tx: Tx, registry: ApprovalHandlerRegistry, input: WithdrawApprovalInput) => {
  handlerFor(registry, input.subjectType);
  const req = await repo.findBySubject(tx, input.workspaceId, input.subjectType, input.subjectId);
  if (!req) return null;
  const now = input.now ?? new Date();
  if (req.status !== 'PENDING' || !(await repo.updatePendingRequest(tx, req.id, { status: 'CANCELLED', decidedAt: now }))) {
    throw conflict('approval_already_decided');
  }
  const note = input.note || null;
  await repo.closePendingSteps(tx, req.id, { decidedByUserId: input.actorUserId, decidedAt: now, note });
  await auditRepository.create(tx, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: 'approval.withdraw',
    entity: 'ApprovalRequest',
    entityId: req.id,
    meta: { subjectType: input.subjectType, subjectId: input.subjectId, stepIds: req.steps.filter((s) => s.decision === 'PENDING').map((s) => s.id), note },
    ip: input.ip,
  });
  return req;
};

export interface EscalationResult {
  escalated: number;
  notifications: number;
}

/**
 * Escalate steps left undecided for at least `approval.escalationWorkingDays` full working days of
 * their approver (FR-ORG-05.1): the step becomes ESCALATED and the same level is routed one level
 * up the chain (UPPER_LEVEL), or to HR at the top. The new approvers and HR are notified
 * (FR-ORG-05.2). Safe to re-run: a step is claimed only while PENDING and notifications are deduped.
 */
export const escalateStaleApprovals = async (tx: Tx, workspaceId: string, registry: ApprovalHandlerRegistry, now: Date = new Date()): Promise<EscalationResult> => {
  const { timeZone, today } = await workspaceToday(tx, workspaceId, now);
  const days = await parameterReader.workspace(tx, workspaceId, 'approval.escalationWorkingDays', parseIsoDate(today));
  // `days` full working days need at least `days` calendar days after the start day.
  const candidates = await repo.staleSteps(tx, workspaceId, new Date(now.getTime() - days * 86_400_000));
  const result: EscalationResult = { escalated: 0, notifications: 0 };

  for (const step of candidates) {
    const request = step.request;
    const [approver] = await repo.usersByIds(tx, workspaceId, [step.approverUserId!]);
    const calendarOf = approver?.employeeId ?? request.requesterEmployeeId;
    const waited = await workingDaysBetween(tx, workspaceId, calendarOf, toWorkDate(step.createdAt, timeZone), today, days);
    if (waited < days) continue;
    if (!(await repo.claimStep(tx, step.id, { decision: 'ESCALATED', decidedByUserId: null, decidedAt: now, note: null }))) continue;

    const full = (await repo.findRequest(tx, workspaceId, request.id))!;
    const requesterUser = await repo.userOfEmployee(tx, workspaceId, request.requesterEmployeeId);
    const next = (await routeLevel(tx, workspaceId, request, step.level, { today, now }, {
      startIndex: (step.chainIndex ?? -1) + 1,
      escalated: true,
      excludeUserIds: excludedUsers(requesterUser?.id ?? null, full.steps),
    }))!;
    const hr = await repo.hrFallbackUserIds(tx, workspaceId);
    const recipients = [...new Set([...(await stepRecipients(tx, workspaceId, next, requesterUser?.id ?? null)), ...hr])].filter(
      (id) => id !== requesterUser?.id,
    );
    const sent = await notify(tx, {
      workspaceId,
      userIds: recipients,
      type: 'APPROVAL_ESCALATED',
      titleKey: 'notif.approvalEscalated.title',
      bodyKey: 'notif.approvalEscalated.body',
      params: { requester: fullName(request.requester), subject: { t: `approval.subject.${request.subjectType}` }, days },
      link: handlerFor(registry, request.subjectType).link(request),
      dedupeKey: `approval-escalated:${next.id}`,
      data: { requestId: request.id, stepId: next.id, fromStepId: step.id },
    });
    await auditRepository.create(tx, {
      workspaceId,
      actorUserId: null,
      action: 'approval.escalate',
      entity: 'ApprovalRequest',
      entityId: request.id,
      meta: {
        level: step.level,
        workingDays: days,
        from: { stepId: step.id, approverUserId: step.approverUserId },
        to: { stepId: next.id, approverUserId: next.approverUserId, delegateUserId: next.delegateUserId, actingAs: next.actingAs },
      },
    });
    result.escalated++;
    result.notifications += sent.created;
  }
  return result;
};

// ───────────────────────────── Inbox & decisions ─────────────────────────────

interface Caller {
  userId: string;
  employeeId: string | null;
  hrFallback: boolean;
  delegatorUserIds: string[];
}

const fallbackSummary = (locale: Locale, type: ApprovalSubjectType): ApprovalSummary => ({ title: translate(locale, `approval.subject.${type}`), detail: null });

/** Summaries of many requests, batched per subject type. Key: request id. */
const summarize = async (
  tx: Tx,
  workspaceId: string,
  registry: ApprovalHandlerRegistry,
  requests: readonly { id: string; subjectType: ApprovalSubjectType; subjectId: string }[],
  locale: Locale,
) => {
  const out = new Map<string, ApprovalSummary>();
  for (const type of new Set(requests.map((r) => r.subjectType))) {
    const ofType = requests.filter((r) => r.subjectType === type);
    const bySubject = await handlerFor(registry, type).summarize(tx, workspaceId, ofType.map((r) => r.subjectId), locale);
    for (const r of ofType) out.set(r.id, bySubject.get(r.subjectId) ?? fallbackSummary(locale, type));
  }
  return out;
};

const pendingStep = (req: { status: string; steps: readonly ApprovalStepRow[] }) =>
  req.status === 'PENDING' ? req.steps.find((s) => s.decision === 'PENDING') : undefined;

/** Capacity the caller may decide the pending step in (never on their own request). */
const capacityOn = (req: ApprovalRequestRow, me: Caller): ApprovalCapacity | null => {
  const step = pendingStep(req);
  if (!step || req.requesterEmployeeId === me.employeeId) return null;
  return approvalCapacityOf(step, me);
};

const canView = (req: ApprovalRequestRow, me: Caller) =>
  me.hrFallback ||
  req.requesterEmployeeId === me.employeeId ||
  capacityOn(req, me) !== null ||
  req.steps.some((s) => s.approverUserId === me.userId || s.delegateUserId === me.userId || s.decidedByUserId === me.userId);

/**
 * Generic approval engine (FR-ORG-02..06): the approver inbox (incl. as delegate and HR fallback),
 * request detail with the step history, and approve / reject with optimistic concurrency.
 */
export const createApprovalsService = (db: Db, registry: ApprovalHandlerRegistry) => {
  const caller = async (tx: Tx, ctx: AuthContext, today: string): Promise<Caller> => ({
    userId: ctx.userId,
    employeeId: ctx.employeeId,
    hrFallback: ctx.permissions.includes(PERMISSIONS.APPROVAL_HR_FALLBACK),
    delegatorUserIds: await repo.delegatorsOf(tx, ctx.workspaceId, ctx.userId, parseIsoDate(today)),
  });

  const toDetail = async (tx: Tx, ctx: AuthContext, req: ApprovalRequestRow, me: Caller): Promise<ApprovalRequestDetail> => {
    const locale = toLocale(await repo.userLocale(tx, ctx.userId));
    const summary = (await summarize(tx, ctx.workspaceId, registry, [req], locale)).get(req.id)!;
    const handler = handlerFor(registry, req.subjectType);
    const ids = [...new Set(req.steps.flatMap((s) => [s.approverUserId, s.delegateUserId, s.decidedByUserId]).filter((v): v is string => !!v))];
    const names = await parametersRepository.userNames(tx, ids);
    const party = (id: string | null) => (id ? { userId: id, name: names.get(id) ?? '—' } : null);
    return {
      id: req.id,
      subjectType: req.subjectType,
      subjectId: req.subjectId,
      status: req.status,
      requester: { employeeId: req.requester.id, employeeCode: req.requester.employeeCode, name: fullName(req.requester) },
      summary,
      link: handler.link(req),
      currentStep: req.currentStep,
      requiredLevels: req.requiredLevels,
      submittedAt: req.createdAt.toISOString(),
      decidedAt: req.decidedAt?.toISOString() ?? null,
      steps: req.steps.map((s) => ({
        id: s.id,
        level: s.level,
        approver: party(s.approverUserId),
        delegate: party(s.delegateUserId),
        actingAs: s.actingAs,
        decision: s.decision,
        decidedBy: party(s.decidedByUserId),
        decidedAt: s.decidedAt?.toISOString() ?? null,
        note: s.note,
        createdAt: s.createdAt.toISOString(),
      })),
      myCapacity: capacityOn(req, me),
      ...(handler.teamOnLeave && req.requesterEmployeeId !== me.employeeId ? { teamOnLeave: await handler.teamOnLeave(tx, ctx.workspaceId, req.subjectId) } : {}),
    };
  };

  /** Close the request, let the subject module react and tell the requester (FR-NOTI-03.2). */
  const finish = async (tx: Tx, ctx: AuthContext, req: ApprovalRequestRow, status: 'APPROVED' | 'REJECTED', note: string | null, now: Date) => {
    if (!(await repo.updatePendingRequest(tx, req.id, { status, decidedAt: now }))) throw conflict('approval_already_decided');
    const handler = handlerFor(registry, req.subjectType);
    const outcome = { workspaceId: ctx.workspaceId, requestId: req.id, subjectId: req.subjectId, actorUserId: ctx.userId, note };
    await (status === 'APPROVED' ? handler.onApproved(tx, outcome) : handler.onRejected(tx, outcome));
    const requesterUser = await repo.userOfEmployee(tx, ctx.workspaceId, req.requesterEmployeeId);
    if (!requesterUser) return;
    const approver = (await parametersRepository.userNames(tx, [ctx.userId])).get(ctx.userId) ?? '';
    await notify(tx, {
      workspaceId: ctx.workspaceId,
      userIds: [requesterUser.id],
      type: 'APPROVAL_DECISION',
      titleKey: status === 'APPROVED' ? 'notif.approvalApproved.title' : 'notif.approvalRejected.title',
      bodyKey: status === 'APPROVED' ? 'notif.approvalApproved.body' : 'notif.approvalRejected.body',
      params: { subject: { t: `approval.subject.${req.subjectType}` }, approver, note: note ?? '' },
      link: handler.link(req),
      dedupeKey: `approval-decision:${req.id}`,
      data: { requestId: req.id, status },
    });
  };

  const decide = (ctx: AuthContext, id: string, decision: 'APPROVED' | 'REJECTED', note: string | null, meta: RequestMeta) =>
    db.tenant(ctx.workspaceId, async (tx) => {
      const ws = ctx.workspaceId;
      const now = new Date();
      const { today } = await workspaceToday(tx, ws, now);
      const me = await caller(tx, ctx, today);
      const req = await repo.findRequest(tx, ws, id);
      if (!req || !canView(req, me)) throw notFound();
      const step = pendingStep(req);
      if (!step) throw conflict('approval_already_decided');
      const capacity = capacityOn(req, me);
      if (!capacity) throw forbidden('approval_not_allowed');
      if (!(await repo.claimStep(tx, step.id, { decision, decidedByUserId: ctx.userId, actingAs: capacity, decidedAt: now, note }))) {
        throw conflict('approval_already_decided');
      }
      await auditRepository.create(tx, {
        workspaceId: ws,
        actorUserId: ctx.userId,
        action: decision === 'APPROVED' ? 'approval.approve' : 'approval.reject',
        entity: 'ApprovalRequest',
        entityId: req.id,
        meta: { stepId: step.id, level: step.level, capacity, onBehalfOfUserId: capacity === 'DELEGATE' ? step.approverUserId : null, note },
        ip: meta.ip,
      });

      const decided = [...req.steps.filter((s) => s.id !== step.id), { decidedByUserId: ctx.userId }];
      const final = decision === 'REJECTED' || step.approverUserId === null || step.level >= req.requiredLevels;
      const next = final
        ? null
        : await routeLevel(tx, ws, req, step.level + 1, { today, now }, {
            startIndex: (step.chainIndex ?? 0) + 1,
            completeWhenChainEnds: true,
            excludeUserIds: excludedUsers((await repo.userOfEmployee(tx, ws, req.requesterEmployeeId))?.id ?? null, decided),
          });
      if (next) {
        if (!(await repo.updatePendingRequest(tx, req.id, { currentStep: next.level }))) throw conflict('approval_already_decided');
        const requesterUser = await repo.userOfEmployee(tx, ws, req.requesterEmployeeId);
        const ctxNotify = { workspaceId: ws, request: req, requesterName: fullName(req.requester), link: handlerFor(registry, req.subjectType).link(req) };
        await notifyPending(tx, ctxNotify, next.id, await stepRecipients(tx, ws, next, requesterUser?.id ?? null));
      } else {
        await finish(tx, ctx, req, decision, note, now);
      }
      return toDetail(tx, ctx, (await repo.findRequest(tx, ws, id))!, me);
    });

  return {
    /** Requests waiting for the caller: own steps, as delegate, and HR fallback steps (oldest first). */
    inbox: (ctx: AuthContext, q: ApprovalInboxQuery): Promise<Paginated<ApprovalInboxItem>> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const { today } = await workspaceToday(tx, ctx.workspaceId, new Date());
        const me = await caller(tx, ctx, today);
        const { items, total } = await repo.inbox(tx, ctx.workspaceId, me, { skip: (q.page - 1) * q.pageSize, take: q.pageSize });
        const locale = toLocale(await repo.userLocale(tx, ctx.userId));
        const summaries = await summarize(tx, ctx.workspaceId, registry, items.map((s) => s.request), locale);
        return {
          items: items.map((s) => ({
            id: s.request.id,
            subjectType: s.request.subjectType,
            requester: { employeeId: s.request.requester.id, employeeCode: s.request.requester.employeeCode, name: fullName(s.request.requester) },
            summary: summaries.get(s.request.id)!,
            link: handlerFor(registry, s.request.subjectType).link(s.request),
            level: s.level,
            requiredLevels: s.request.requiredLevels,
            myCapacity: approvalCapacityOf(s, me)!,
            submittedAt: s.request.createdAt.toISOString(),
            pendingSince: s.createdAt.toISOString(),
          })),
          total,
          page: q.page,
          pageSize: q.pageSize,
        };
      }),

    /** Request detail with its full step history (FR-ORG-06), for the requester, its approvers and HR. */
    get: (ctx: AuthContext, id: string): Promise<ApprovalRequestDetail> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const { today } = await workspaceToday(tx, ctx.workspaceId, new Date());
        const me = await caller(tx, ctx, today);
        const req = await repo.findRequest(tx, ctx.workspaceId, id);
        if (!req || !canView(req, me)) throw notFound();
        return toDetail(tx, ctx, req, me);
      }),

    approve: (ctx: AuthContext, id: string, note: string | undefined, meta: RequestMeta) => decide(ctx, id, 'APPROVED', note || null, meta),
    reject: (ctx: AuthContext, id: string, note: string, meta: RequestMeta) => decide(ctx, id, 'REJECTED', note, meta),
  };
};

export type ApprovalsService = ReturnType<typeof createApprovalsService>;
