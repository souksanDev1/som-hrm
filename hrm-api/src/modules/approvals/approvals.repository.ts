import { PERMISSIONS, type ApprovalCapacity, type ApprovalDecision, type ApprovalSubjectType } from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';

/** Most managers above one employee that routing looks at; deeper (or cyclic) reporting lines are cut. */
const MAX_CHAIN_DEPTH = 50;

export interface ChainRow {
  employeeId: string;
  depth: number;
  userId: string | null;
  userActive: boolean | null;
  status: string;
}

const requestInclude = {
  requester: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
  steps: { orderBy: [{ createdAt: 'asc' }, { level: 'asc' }] },
} as const satisfies Prisma.ApprovalRequestInclude;

const activeOn = (date: Date) => ({ isActive: true, startDate: { lte: date }, endDate: { gte: date } });

/** Approval requests, steps, delegations and the lookups routing needs (FR-ORG-02..06). */
export const approvalsRepository = {
  /**
   * Managers above `employeeId`, direct manager first. The walk stops at a repeated employee
   * (including the requester), so a cycle in the reporting lines cannot loop.
   */
  chainOf: (tx: Tx, workspaceId: string, employeeId: string) =>
    tx.$queryRaw<ChainRow[]>`
      WITH RECURSIVE chain AS (
        SELECT m."id", m."managerId", 0 AS depth, ARRAY[e."id", m."id"] AS path
        FROM "Employee" e JOIN "Employee" m ON m."id" = e."managerId" AND m."workspaceId" = e."workspaceId"
        WHERE e."id" = ${employeeId} AND e."workspaceId" = ${workspaceId}
        UNION ALL
        SELECT m."id", m."managerId", c.depth + 1, c.path || m."id"
        FROM chain c JOIN "Employee" m ON m."id" = c."managerId" AND m."workspaceId" = ${workspaceId}
        WHERE NOT m."id" = ANY(c.path) AND c.depth < ${MAX_CHAIN_DEPTH}
      )
      SELECT c."id" AS "employeeId", c.depth, u."id" AS "userId", u."isActive" AS "userActive", e."status"::text AS "status"
      FROM chain c
      JOIN "Employee" e ON e."id" = c."id"
      LEFT JOIN "User" u ON u."employeeId" = c."id"
      ORDER BY c.depth`,

  /** Of `employeeIds`, those on approved leave covering `date` (FR-ORG-04). */
  onLeave: async (tx: Tx, workspaceId: string, employeeIds: string[], date: Date) =>
    new Set(
      (
        await tx.leaveRequest.findMany({
          where: { workspaceId, employeeId: { in: employeeIds }, status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
          select: { employeeId: true },
        })
      ).map((r) => r.employeeId),
    ),

  /** Delegations of `delegatorUserIds` in force on `date`. */
  activeDelegationsOf: (tx: Tx, workspaceId: string, delegatorUserIds: string[], date: Date) =>
    tx.approvalDelegation.findMany({ where: { workspaceId, delegatorUserId: { in: delegatorUserIds }, ...activeOn(date) } }),

  /** Users who delegated to `userId` for `date`. */
  delegatorsOf: async (tx: Tx, workspaceId: string, userId: string, date: Date) =>
    (await tx.approvalDelegation.findMany({ where: { workspaceId, delegateUserId: userId, ...activeOn(date) }, select: { delegatorUserId: true } })).map(
      (d) => d.delegatorUserId,
    ),

  usersByIds: (tx: Tx, workspaceId: string, ids: string[]) =>
    tx.user.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, displayName: true, isActive: true, employeeId: true, locale: true } }),

  userOfEmployee: (tx: Tx, workspaceId: string, employeeId: string) =>
    tx.user.findFirst({ where: { workspaceId, employeeId }, select: { id: true, isActive: true } }),

  userLocale: async (tx: Tx, userId: string) => (await tx.user.findUnique({ where: { id: userId }, select: { locale: true } }))?.locale ?? 'lo',

  /** Active users holding `approval.hr_fallback` (FR-ORG-02 fallback, FR-ORG-05.2). */
  hrFallbackUserIds: async (tx: Tx, workspaceId: string) =>
    (
      await tx.user.findMany({
        where: { workspaceId, isActive: true, roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.APPROVAL_HR_FALLBACK } } } } } } },
        select: { id: true },
      })
    ).map((u) => u.id),

  hasDirectReports: async (tx: Tx, workspaceId: string, employeeId: string | null) =>
    !!employeeId && (await tx.employee.count({ where: { workspaceId, managerId: employeeId } })) > 0,

  holidaysBetween: (tx: Tx, workspaceId: string, from: Date, to: Date) =>
    tx.holiday.findMany({ where: { workspaceId, date: { gte: from, lte: to } }, select: { date: true, womenOnly: true, nationality: true } }),

  // ── Requests & steps ──

  createRequest: (
    tx: Tx,
    data: { workspaceId: string; subjectType: ApprovalSubjectType; subjectId: string; requesterEmployeeId: string; requiredLevels: number; submittedByUserId: string | null },
  ) => tx.approvalRequest.create({ data }),

  findRequest: (tx: Tx, workspaceId: string, id: string) => tx.approvalRequest.findFirst({ where: { id, workspaceId }, include: requestInclude }),

  findBySubject: (tx: Tx, workspaceId: string, subjectType: ApprovalSubjectType, subjectId: string) =>
    tx.approvalRequest.findFirst({ where: { workspaceId, subjectType, subjectId }, include: requestInclude }),

  /**
   * Close the still-pending steps of a withdrawn request. ApprovalDecision has no WITHDRAWN value, so the decision
   * stays PENDING while `decidedBy` / `decidedAt` / `note` record who withdrew it; the request is CANCELLED, so the
   * step can no longer be decided, escalated or listed in an inbox.
   */
  closePendingSteps: (tx: Tx, requestId: string, data: { decidedByUserId: string | null; decidedAt: Date; note: string | null }) =>
    tx.approvalStep.updateMany({ where: { requestId, decision: 'PENDING', decidedAt: null }, data }),

  createStep: (
    tx: Tx,
    data: {
      workspaceId: string;
      requestId: string;
      level: number;
      chainIndex: number | null;
      approverUserId: string | null;
      delegateUserId: string | null;
      actingAs: ApprovalCapacity;
      /** The engine's clock, so a step's age (escalation) is measured on the same timeline. */
      createdAt: Date;
    },
  ) => tx.approvalStep.create({ data }),

  /**
   * Decide a step only if it is still pending. Concurrent deciders (manager + delegate, or the
   * escalation job) serialise on the row lock; the loser sees `decision <> PENDING` and gets 0.
   */
  claimStep: async (
    tx: Tx,
    id: string,
    data: { decision: ApprovalDecision; decidedByUserId: string | null; actingAs?: ApprovalCapacity; decidedAt: Date; note: string | null },
  ) => (await tx.approvalStep.updateMany({ where: { id, decision: 'PENDING' }, data })).count === 1,

  /** Move a pending request on (next level) or close it; false when it is no longer pending. */
  updatePendingRequest: async (tx: Tx, id: string, data: { status?: 'APPROVED' | 'REJECTED' | 'CANCELLED'; currentStep?: number; decidedAt?: Date }) =>
    (await tx.approvalRequest.updateMany({ where: { id, status: 'PENDING' }, data })).count === 1,

  /** Pending steps the user may decide: own, delegated to them, or (HR) unassigned. Never their own requests. */
  inbox: async (
    tx: Tx,
    workspaceId: string,
    me: { userId: string; employeeId: string | null; delegatorUserIds: string[]; hrFallback: boolean },
    page: { skip: number; take: number },
  ) => {
    const where: Prisma.ApprovalStepWhereInput = {
      workspaceId,
      decision: 'PENDING',
      request: { status: 'PENDING', ...(me.employeeId ? { requesterEmployeeId: { not: me.employeeId } } : {}) },
      OR: [
        { approverUserId: me.userId },
        { delegateUserId: me.userId },
        ...(me.delegatorUserIds.length ? [{ approverUserId: { in: me.delegatorUserIds } }] : []),
        ...(me.hrFallback ? [{ approverUserId: null }] : []),
      ],
    };
    const [items, total] = await Promise.all([
      tx.approvalStep.findMany({
        where,
        include: { request: { include: { requester: requestInclude.requester } } },
        orderBy: { createdAt: 'asc' },
        ...page,
      }),
      tx.approvalStep.count({ where }),
    ]);
    return { items, total };
  },

  /** Pending steps older than `before` that a manager owns (HR steps do not escalate further). */
  staleSteps: (tx: Tx, workspaceId: string, before: Date) =>
    tx.approvalStep.findMany({
      where: { workspaceId, decision: 'PENDING', approverUserId: { not: null }, createdAt: { lt: before }, request: { status: 'PENDING' } },
      include: { request: { include: { requester: requestInclude.requester } } },
      orderBy: { createdAt: 'asc' },
    }),

  // ── Delegations ──

  /** Serialise delegation writes of one delegator until the transaction ends (overlap check). */
  lockDelegator: (tx: Tx, delegatorUserId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`delegation:${delegatorUserId}`}))`,

  findDelegation: (tx: Tx, workspaceId: string, id: string) => tx.approvalDelegation.findFirst({ where: { id, workspaceId } }),

  /** An active delegation of `delegatorUserId` sharing a day with [start, end], other than `excludeId`. */
  findOverlap: (tx: Tx, workspaceId: string, delegatorUserId: string, start: Date, end: Date, excludeId?: string) =>
    tx.approvalDelegation.findFirst({
      where: { workspaceId, delegatorUserId, isActive: true, startDate: { lte: end }, endDate: { gte: start }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    }),

  /** Active delegation of `delegatorUserId` covering all of [start, end]. */
  findCovering: (tx: Tx, workspaceId: string, delegatorUserId: string, start: Date, end: Date) =>
    tx.approvalDelegation.findFirst({ where: { workspaceId, delegatorUserId, isActive: true, startDate: { lte: start }, endDate: { gte: end } } }),

  listDelegations: (tx: Tx, workspaceId: string, userId: string | null) =>
    tx.approvalDelegation.findMany({
      where: { workspaceId, ...(userId ? { OR: [{ delegatorUserId: userId }, { delegateUserId: userId }] } : {}) },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    }),

  createDelegation: (
    tx: Tx,
    data: { workspaceId: string; delegatorUserId: string; delegateUserId: string; startDate: Date; endDate: Date; reason: string | null; createdById: string | null },
  ) => tx.approvalDelegation.create({ data }),

  updateDelegation: (tx: Tx, id: string, data: Prisma.ApprovalDelegationUpdateInput) => tx.approvalDelegation.update({ where: { id }, data }),

  /** Active users that can be picked as delegate (and, for HR, as delegator). */
  delegateCandidates: (tx: Tx, workspaceId: string) =>
    tx.user.findMany({
      where: { workspaceId, isActive: true },
      select: { id: true, displayName: true, employee: { select: { employeeCode: true, _count: { select: { reports: true } } } } },
      orderBy: { displayName: 'asc' },
    }),
};

export type ApprovalRequestRow = NonNullable<Awaited<ReturnType<typeof approvalsRepository.findRequest>>>;
export type ApprovalStepRow = ApprovalRequestRow['steps'][number];
export type DelegationRow = NonNullable<Awaited<ReturnType<typeof approvalsRepository.findDelegation>>>;
