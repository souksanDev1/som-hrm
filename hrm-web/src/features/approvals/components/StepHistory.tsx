'use client';
import type { ApprovalStep, RequestStatus } from '@hrm/shared';
import { Badge } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';
import { CapacityBadge, DecisionBadge } from './ApprovalBadges';

const day = (iso: string) => iso.slice(0, 10);

export interface StepHistoryProps {
  steps: readonly ApprovalStep[];
  requiredLevels: number;
  /** Status of the request; a CANCELLED request shows its still-open step as withdrawn (FR-LV-12.1). */
  requestStatus?: RequestStatus;
}

/** Who each level was routed to, who decided it and in what capacity (FR-ORG-06). Oldest first. */
export function StepHistory({ steps, requiredLevels, requestStatus }: StepHistoryProps) {
  const t = useT();
  return (
    <ol className="flex flex-col divide-y divide-line dark:divide-night-line" data-testid="approval-history">
      {steps.map((s) => {
        const withdrawn = requestStatus === 'CANCELLED' && s.decision === 'PENDING';
        return (
          <li key={s.id} className="flex flex-col gap-1 py-3" data-testid="approval-step">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink dark:text-night-ink">
                {fill(t('approval.level'), { level: s.level, total: Math.max(requiredLevels, s.level) })}
              </span>
              {withdrawn ? <Badge tone="neutral">{t('approval.withdrawn')}</Badge> : <DecisionBadge decision={s.decision} />}
              <CapacityBadge capacity={s.actingAs} />
            </div>
            <p className="text-sm text-ink dark:text-night-ink">
              {s.approver?.name ?? t('approval.hrPool')}
              {s.delegate && <span className="text-ink-muted"> · {fill(t('approval.delegateOf'), { name: s.delegate.name })}</span>}
            </p>
            <p className="text-xs text-ink-muted" data-testid="approval-step-meta">
              {withdrawn
                ? `${s.decidedBy ? fill(t('approval.withdrawnBy'), { name: s.decidedBy.name }) : t('approval.withdrawn')} · ${day(s.decidedAt ?? s.createdAt)}`
                : s.decidedBy
                ? `${fill(t('approval.decidedBy'), { name: s.decidedBy.name, capacity: t(`approval.capacity.${s.actingAs}`) })} · ${day(s.decidedAt ?? s.createdAt)}`
                : s.decision === 'PENDING'
                  ? fill(t('approval.pendingSince'), { date: day(s.createdAt) })
                  : day(s.decidedAt ?? s.createdAt)}
            </p>
            {s.note && <p className="text-sm italic text-ink-muted">“{s.note}”</p>}
          </li>
        );
      })}
    </ol>
  );
}
