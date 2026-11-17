import {
  isoDateInTimeZone,
  PERMISSIONS,
  type AbsenceDelegationInput,
  type AbsenceDelegationResult,
  type CreateDelegationInput,
  type DelegateCandidate,
  type Delegation,
  type DelegationList,
  type DelegationStatus,
  type UpdateDelegationInput,
} from '@hrm/shared';
import type { Db, Tx } from '../../db/client';
import { parseIsoDate, toIsoDate } from '../../lib/dates';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { parametersRepository } from '../parameters/parameters.repository';
import { approvalsRepository as repo, type DelegationRow } from './approvals.repository';

interface RequestMeta {
  ip?: string;
}

interface Range {
  startDate: string;
  endDate: string;
}

const iso = (d: Date) => toIsoDate(d)!;
const todayOf = async (tx: Tx, workspaceId: string) => isoDateInTimeZone(await parametersRepository.workspaceTimezone(tx, workspaceId));

const statusOf = (d: DelegationRow, today: string): DelegationStatus =>
  !d.isActive ? 'CANCELLED' : iso(d.endDate) < today ? 'ENDED' : iso(d.startDate) > today ? 'SCHEDULED' : 'ACTIVE';

const toViews = async (tx: Tx, rows: DelegationRow[], today: string): Promise<Delegation[]> => {
  const names = await parametersRepository.userNames(tx, [...new Set(rows.flatMap((d) => [d.delegatorUserId, d.delegateUserId]))]);
  const party = (id: string) => ({ userId: id, name: names.get(id) ?? '—' });
  return rows.map((d) => ({
    id: d.id,
    delegator: party(d.delegatorUserId),
    delegate: party(d.delegateUserId),
    startDate: iso(d.startDate),
    endDate: iso(d.endDate),
    reason: d.reason,
    status: statusOf(d, today),
    createdAt: d.createdAt.toISOString(),
  }));
};

/** A delegator is a manager: their employee record has direct reports (FR-ORG-03.1). */
const isManagerUser = async (tx: Tx, workspaceId: string, userId: string) => {
  const [user] = await repo.usersByIds(tx, workspaceId, [userId]);
  return !!user?.isActive && (await repo.hasDirectReports(tx, workspaceId, user.employeeId));
};

/**
 * FR-ORG-03.1 rules: no self-delegation, the range is not over yet, the delegate is an active user
 * of this workspace (RLS hides other tenants), and no other active delegation of the same manager
 * shares a day. Writes of one delegator are serialised so two requests cannot both pass the check.
 */
const assertValid = async (tx: Tx, workspaceId: string, delegatorUserId: string, input: Range & { delegateUserId: string }, today: string, excludeId?: string) => {
  if (input.delegateUserId === delegatorUserId) throw badRequest('delegation_self', { field: 'delegateUserId' });
  if (input.endDate < today) throw badRequest('delegation_in_past', { field: 'endDate', today });
  const [delegate] = await repo.usersByIds(tx, workspaceId, [input.delegateUserId]);
  if (!delegate?.isActive) throw badRequest('delegate_invalid', { field: 'delegateUserId' });
  await repo.lockDelegator(tx, delegatorUserId);
  const overlap = await repo.findOverlap(tx, workspaceId, delegatorUserId, parseIsoDate(input.startDate), parseIsoDate(input.endDate), excludeId);
  if (overlap) throw conflict('delegation_overlap', { delegationId: overlap.id, startDate: iso(overlap.startDate), endDate: iso(overlap.endDate) });
};

const auditDelegation = (tx: Tx, workspaceId: string, actorUserId: string | null, action: string, row: DelegationRow, meta: Record<string, unknown>, ip?: string) =>
  auditRepository.create(tx, {
    workspaceId,
    actorUserId,
    action,
    entity: 'ApprovalDelegation',
    entityId: row.id,
    meta: { delegatorUserId: row.delegatorUserId, delegateUserId: row.delegateUserId, ...meta } as object,
    ip,
  });

const createRow = async (
  tx: Tx,
  workspaceId: string,
  actorUserId: string | null,
  delegatorUserId: string,
  input: Range & { delegateUserId: string; reason?: string | null },
  today: string,
  meta: RequestMeta & { source?: string },
) => {
  await assertValid(tx, workspaceId, delegatorUserId, input, today);
  const row = await repo.createDelegation(tx, {
    workspaceId,
    delegatorUserId,
    delegateUserId: input.delegateUserId,
    startDate: parseIsoDate(input.startDate),
    endDate: parseIsoDate(input.endDate),
    reason: input.reason || null,
    createdById: actorUserId,
  });
  await auditDelegation(tx, workspaceId, actorUserId, 'approval.delegation.create', row, {
    startDate: input.startDate,
    endDate: input.endDate,
    reason: row.reason,
    ...(meta.source ? { source: meta.source } : {}),
  }, meta.ip);
  return row;
};

/**
 * FR-ORG-03.2 hook for leave filing (M6 calls it inside its own transaction): a manager who is away
 * for [startDate, endDate] needs a delegate for that period. Returns the delegation already
 * covering the period, creates one with `delegateUserId` (active automatically on those dates), or
 * reports that one is still needed. Employees without direct reports never need one.
 */
export const ensureDelegationForAbsence = async (
  tx: Tx,
  workspaceId: string,
  actorUserId: string | null,
  input: AbsenceDelegationInput & { managerEmployeeId: string | null },
  meta: RequestMeta = {},
): Promise<AbsenceDelegationResult> => {
  if (!input.managerEmployeeId || !(await repo.hasDirectReports(tx, workspaceId, input.managerEmployeeId))) return { needsDelegate: false, delegation: null };
  const manager = await repo.userOfEmployee(tx, workspaceId, input.managerEmployeeId);
  if (!manager?.isActive) return { needsDelegate: false, delegation: null };
  const today = await todayOf(tx, workspaceId);
  const covering = await repo.findCovering(tx, workspaceId, manager.id, parseIsoDate(input.startDate), parseIsoDate(input.endDate));
  if (covering) return { needsDelegate: false, delegation: (await toViews(tx, [covering], today))[0]! };
  if (!input.delegateUserId) return { needsDelegate: true, delegation: null };
  const row = await createRow(tx, workspaceId, actorUserId, manager.id, { ...input, delegateUserId: input.delegateUserId }, today, { ...meta, source: 'absence' });
  return { needsDelegate: false, delegation: (await toViews(tx, [row], today))[0]! };
};

/**
 * Approval delegations (FR-ORG-03.1). A manager (anyone with direct reports) manages their own;
 * `approval.delegate.manage` sees and manages everyone's. Every change is audit-logged.
 */
export const createDelegationsService = (db: Db) => {
  const canManageAll = (ctx: AuthContext) => ctx.permissions.includes(PERMISSIONS.APPROVAL_DELEGATE_MANAGE);

  /** A delegation the caller may change: their own, or any with `approval.delegate.manage`. */
  const loadOwn = async (tx: Tx, ctx: AuthContext, id: string, today: string) => {
    const row = await repo.findDelegation(tx, ctx.workspaceId, id);
    if (!row || (row.delegatorUserId !== ctx.userId && !canManageAll(ctx))) throw notFound();
    if (statusOf(row, today) === 'CANCELLED' || statusOf(row, today) === 'ENDED') throw conflict('delegation_closed');
    return row;
  };

  return {
    list: (ctx: AuthContext): Promise<DelegationList> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const today = await todayOf(tx, ctx.workspaceId);
        const all = canManageAll(ctx);
        const rows = await repo.listDelegations(tx, ctx.workspaceId, all ? null : ctx.userId);
        return {
          canDelegate: all || (await repo.hasDirectReports(tx, ctx.workspaceId, ctx.employeeId)),
          canManageAll: all,
          items: await toViews(tx, rows, today),
        };
      }),

    create: (ctx: AuthContext, input: CreateDelegationInput, meta: RequestMeta): Promise<Delegation> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const delegatorUserId = input.delegatorUserId ?? ctx.userId;
        if (delegatorUserId !== ctx.userId && !canManageAll(ctx)) throw forbidden();
        if (!(await isManagerUser(tx, ctx.workspaceId, delegatorUserId))) throw forbidden('not_a_manager');
        const today = await todayOf(tx, ctx.workspaceId);
        const row = await createRow(tx, ctx.workspaceId, ctx.userId, delegatorUserId, input, today, meta);
        return (await toViews(tx, [row], today))[0]!;
      }),

    update: (ctx: AuthContext, id: string, input: UpdateDelegationInput, meta: RequestMeta): Promise<Delegation> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const today = await todayOf(tx, ctx.workspaceId);
        const before = await loadOwn(tx, ctx, id, today);
        await assertValid(tx, ctx.workspaceId, before.delegatorUserId, input, today, before.id);
        const row = await repo.updateDelegation(tx, before.id, {
          delegateUserId: input.delegateUserId,
          startDate: parseIsoDate(input.startDate),
          endDate: parseIsoDate(input.endDate),
          reason: input.reason || null,
        });
        await auditDelegation(tx, ctx.workspaceId, ctx.userId, 'approval.delegation.update', row, {
          old: { delegateUserId: before.delegateUserId, startDate: iso(before.startDate), endDate: iso(before.endDate), reason: before.reason },
          new: { delegateUserId: row.delegateUserId, startDate: input.startDate, endDate: input.endDate, reason: row.reason },
        }, meta.ip);
        return (await toViews(tx, [row], today))[0]!;
      }),

    /** Cancel (kept for history): requests routed from now on no longer reach the delegate. */
    cancel: (ctx: AuthContext, id: string, meta: RequestMeta): Promise<Delegation> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const today = await todayOf(tx, ctx.workspaceId);
        const before = await loadOwn(tx, ctx, id, today);
        const row = await repo.updateDelegation(tx, before.id, { isActive: false });
        await auditDelegation(tx, ctx.workspaceId, ctx.userId, 'approval.delegation.cancel', row, { startDate: iso(row.startDate), endDate: iso(row.endDate) }, meta.ip);
        return (await toViews(tx, [row], today))[0]!;
      }),

    /** Active users who can be picked as delegate (everyone but the caller) or, for HR, as delegator. */
    candidates: (ctx: AuthContext): Promise<DelegateCandidate[]> =>
      db.tenant(ctx.workspaceId, async (tx) =>
        (await repo.delegateCandidates(tx, ctx.workspaceId))
          .filter((u) => u.id !== ctx.userId)
          .map((u) => ({ userId: u.id, name: u.displayName, employeeCode: u.employee?.employeeCode ?? null, isManager: (u.employee?._count.reports ?? 0) > 0 })),
      ),

    /** FR-ORG-03.2 for the signed-in user (see {@link ensureDelegationForAbsence}). */
    forAbsence: (ctx: AuthContext, input: AbsenceDelegationInput, meta: RequestMeta): Promise<AbsenceDelegationResult> =>
      db.tenant(ctx.workspaceId, (tx) => ensureDelegationForAbsence(tx, ctx.workspaceId, ctx.userId, { ...input, managerEmployeeId: ctx.employeeId }, meta)),
  };
};

export type DelegationsService = ReturnType<typeof createDelegationsService>;
