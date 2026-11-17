import type { Db } from '../../db/client';
import type { ApprovalHandlerRegistry } from '../../modules/approvals/approval-handlers';
import { escalateStaleApprovals, type EscalationResult } from '../../modules/approvals/approvals.service';
import { defaultApprovalRegistry } from '../../modules/approvals/registry';

/**
 * Daily escalation of stale approval steps for one workspace (FR-ORG-05.1/05.2). Idempotent: steps
 * are claimed only while pending and notifications carry a per-step dedupe key, so re-runs and
 * overlapping schedules are harmless.
 */
export const runApprovalEscalation = (
  db: Db,
  workspaceId: string,
  now: Date = new Date(),
  registry: ApprovalHandlerRegistry = defaultApprovalRegistry,
): Promise<EscalationResult> => db.tenant(workspaceId, (tx) => escalateStaleApprovals(tx, workspaceId, registry, now), { timeoutMs: 60_000 });
