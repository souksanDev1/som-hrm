import type { ApprovalSubjectType, ApprovalSummary, Locale } from '@hrm/shared';
import type { Tx } from '../../db/client';

/** What a subject module learns when its request is decided (inside the deciding transaction). */
export interface ApprovalOutcome {
  workspaceId: string;
  requestId: string;
  subjectId: string;
  /** Who made the final decision; null when the system did. */
  actorUserId: string | null;
  note: string | null;
}

/**
 * How a subject module (leave, overtime, attendance correction) plugs into the approval engine.
 * Hooks run in the engine's transaction, so a failing hook rolls the decision back.
 */
export interface ApprovalSubjectHandler {
  subjectType: ApprovalSubjectType;
  /**
   * Who decides level 1: `chain` (default) routes along the requester's chain of command; `hr` sends the request
   * straight to HR (holders of `approval.hr_fallback`, capacity HR) — e.g. device change (FR-ATT-11.3). An HR step
   * is always final.
   */
  routing?: 'chain' | 'hr';
  /** Inbox / detail description of each subject, in `locale`. Ids without a row may be left out. */
  summarize(tx: Tx, workspaceId: string, subjectIds: string[], locale: Locale): Promise<Map<string, ApprovalSummary>>;
  onApproved(tx: Tx, outcome: ApprovalOutcome): Promise<void>;
  onRejected(tx: Tx, outcome: ApprovalOutcome): Promise<void>;
  /** In-app route of the request, used by notifications (FR-NOTI-04.2) and the inbox. */
  link(request: { id: string; subjectId: string }): string;
}

export type ApprovalHandlerRegistry = ReadonlyMap<ApprovalSubjectType, ApprovalSubjectHandler>;

export const createApprovalRegistry = (handlers: readonly ApprovalSubjectHandler[]): ApprovalHandlerRegistry => {
  const map = new Map<ApprovalSubjectType, ApprovalSubjectHandler>();
  for (const h of handlers) {
    if (map.has(h.subjectType)) throw new Error(`Duplicate approval handler for ${h.subjectType}`);
    map.set(h.subjectType, h);
  }
  return map;
};

export const handlerFor = (registry: ApprovalHandlerRegistry, type: ApprovalSubjectType): ApprovalSubjectHandler => {
  const h = registry.get(type);
  if (!h) throw new Error(`No approval handler registered for ${type}`);
  return h;
};

/** Default in-app route of a request: the generic approval detail. */
export const approvalLink = (requestId: string) => `/approvals/${requestId}`;
