/**
 * Approval routing over the chain of command (FR-ORG-02/03/04). Pure: the API loads the chain,
 * approved leave and active delegations, and this decides who must act on the next step.
 */
import { ApprovalCapacity } from '../enums';

/** One manager of the requester's chain of command, direct manager first (index 0). */
export interface ApprovalChainMember {
  employeeId: string;
  /** Login of the manager; null when they have none (cannot approve). */
  userId: string | null;
  /** False when the login is disabled or the employee has left. */
  active: boolean;
}

/** True when the employee is on approved leave on `date` (YYYY-MM-DD). */
export type ApprovalLeaveLookup = (employeeId: string, date: string) => boolean;

/** The delegate the user appointed for `date`, if any. */
export interface ApprovalDelegateInfo {
  userId: string;
  /** False when the delegate's login is disabled. */
  active: boolean;
}
export type ApprovalDelegationLookup = (userId: string, date: string) => ApprovalDelegateInfo | null;

export interface ResolveApproverOptions {
  /** Chain index the search starts at (the expected approver of this level). Default 0. */
  startIndex?: number;
  /** Users who must not act: the requester and anyone who already decided a step of the request. */
  excludeUserIds?: readonly string[];
  /** Escalation (FR-ORG-05): whoever is found acts in the UPPER_LEVEL capacity. */
  escalated?: boolean;
  /**
   * A later level of a multi-level chain: when nobody is above the previous approver the request
   * is complete (`none`) rather than handed to HR.
   */
  completeWhenChainEnds?: boolean;
}

export type ResolvedApprover =
  | {
      kind: 'manager';
      /** Chain index of the manager who owns the step. */
      chainIndex: number;
      approverUserId: string;
      /** MANAGER for the expected manager, UPPER_LEVEL when someone higher takes over. */
      actingAs: typeof ApprovalCapacity.MANAGER | typeof ApprovalCapacity.UPPER_LEVEL;
      /** The manager's active delegate for the date, who may act in the DELEGATE capacity. */
      delegateUserId: string | null;
    }
  | { kind: 'hr' }
  | { kind: 'none' };

/**
 * Who handles the next approval step on `date`.
 *
 * Walking up the chain from `startIndex`:
 * 1. a manager without an active login (none, disabled, left) or excluded is skipped;
 * 2. a manager with an active delegate for the date gets the step, the delegate may act for them
 *    (FR-ORG-03) — a delegate who is inactive, excluded or the manager themselves is ignored;
 * 3. a manager on approved leave without such a delegate is skipped (FR-ORG-04);
 * 4. otherwise the manager gets the step.
 * Repeated employees (a cycle in the reporting lines) end the walk. When nobody is found the step
 * goes to HR (`hr`), except with `completeWhenChainEnds` when the chain simply has no one above
 * `startIndex` (`none`: the top of the chain already approved).
 */
export const resolveApprover = (
  chain: readonly ApprovalChainMember[],
  date: string,
  leaveLookup: ApprovalLeaveLookup,
  delegationLookup: ApprovalDelegationLookup,
  opts: ResolveApproverOptions = {},
): ResolvedApprover => {
  const start = Math.max(0, opts.startIndex ?? 0);
  const excluded = new Set(opts.excludeUserIds ?? []);
  const seen = new Set(chain.slice(0, start).map((m) => m.employeeId));
  let reachable = 0;

  for (let i = start; i < chain.length; i++) {
    const member = chain[i]!;
    if (seen.has(member.employeeId)) break;
    seen.add(member.employeeId);
    reachable++;
    if (!member.userId || !member.active || excluded.has(member.userId)) continue;

    const delegate = delegationLookup(member.userId, date);
    const delegateUserId =
      delegate && delegate.active && delegate.userId !== member.userId && !excluded.has(delegate.userId) ? delegate.userId : null;
    if (!delegateUserId && leaveLookup(member.employeeId, date)) continue;

    return {
      kind: 'manager',
      chainIndex: i,
      approverUserId: member.userId,
      actingAs: i === start && !opts.escalated ? ApprovalCapacity.MANAGER : ApprovalCapacity.UPPER_LEVEL,
      delegateUserId,
    };
  }
  return reachable === 0 && opts.completeWhenChainEnds ? { kind: 'none' } : { kind: 'hr' };
};

/**
 * Capacity in which `userId` may decide a pending step, or null when they may not (FR-ORG-06).
 * `delegatorUserIds` are the users who delegated to `userId` for today.
 */
export const approvalCapacityOf = (
  step: { approverUserId: string | null; delegateUserId: string | null; actingAs: ApprovalCapacity },
  user: { userId: string; hrFallback: boolean; delegatorUserIds: readonly string[] },
): ApprovalCapacity | null => {
  if (step.approverUserId === null) return user.hrFallback ? ApprovalCapacity.HR : null;
  if (step.approverUserId === user.userId) return step.actingAs;
  if (step.delegateUserId === user.userId || user.delegatorUserIds.includes(step.approverUserId)) return ApprovalCapacity.DELEGATE;
  return null;
};

/** Inclusive date ranges (YYYY-MM-DD) share at least one day. */
export const dateRangesOverlap = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }): boolean =>
  a.startDate <= b.endDate && b.startDate <= a.endDate;
