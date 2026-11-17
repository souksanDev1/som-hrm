'use client';
import type { ApprovalCapacity, ApprovalDecision, DelegationStatus, RequestStatus } from '@hrm/shared';
import { Badge, type BadgeTone } from '@/components/ui';
import { useT } from '@/lib/i18n';

const DECISION_TONES: Record<ApprovalDecision, BadgeTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', ESCALATED: 'neutral' };
const STATUS_TONES: Record<RequestStatus, BadgeTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' };
const DELEGATION_TONES: Record<DelegationStatus, BadgeTone> = { ACTIVE: 'success', SCHEDULED: 'primary', ENDED: 'neutral', CANCELLED: 'neutral' };

/** Outcome of one approval step. */
export function DecisionBadge({ decision }: { decision: ApprovalDecision }) {
  const t = useT();
  return <Badge tone={DECISION_TONES[decision]}>{t(`approval.decision.${decision}`)}</Badge>;
}

/** Overall status of a request. */
export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const t = useT();
  return (
    <Badge tone={STATUS_TONES[status]} className="shrink-0">
      <span data-testid="approval-status">{t(`approval.status.${status}`)}</span>
    </Badge>
  );
}

/** Capacity an approver acts in (FR-ORG-06). */
export function CapacityBadge({ capacity }: { capacity: ApprovalCapacity }) {
  const t = useT();
  return <Badge tone={capacity === 'MANAGER' ? 'primary' : 'neutral'}>{t(`approval.capacity.${capacity}`)}</Badge>;
}

export function DelegationStatusBadge({ status }: { status: DelegationStatus }) {
  const t = useT();
  return <Badge tone={DELEGATION_TONES[status]}>{t(`delegation.status.${status}`)}</Badge>;
}
