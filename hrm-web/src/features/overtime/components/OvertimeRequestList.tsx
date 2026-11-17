'use client';
import { formatDurationMinutes, interpolate, type OvertimeRequestView, type RequestStatus } from '@hrm/shared';
import Link from 'next/link';
import { Badge, type BadgeTone } from '@/components/ui';
import { useT } from '@/lib/i18n';

const STATUS_TONE: Record<RequestStatus, BadgeTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' };

export interface OvertimeRequestListProps {
  items: readonly OvertimeRequestView[];
  /** Show the employee on each row (report view). */
  showEmployee?: boolean;
}

/** OT requests with status, planned / actual times and the counted total. Rows link to the approval detail. */
export function OvertimeRequestList({ items, showEmployee }: OvertimeRequestListProps) {
  const t = useT();
  return (
    <ul className="divide-y divide-line dark:divide-night-line" data-testid="ot-list">
      {items.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-3" data-testid="ot-item">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink dark:text-night-ink">
              {r.workDate} · {t(`otx.kind.${r.kind}`)}
              {showEmployee && <span className="ml-2 text-ink-muted">{`${r.employeeCode} ${r.employeeName}`}</span>}
            </p>
            <p className="text-xs text-ink-muted">
              {interpolate(t('otx.planned'), { start: r.plannedStartTime, end: r.plannedEndTime })}
              {r.actualStartTime && r.actualEndTime && r.kind === 'PRE' && (
                <> · {interpolate(t('otx.actual'), { start: r.actualStartTime, end: r.actualEndTime })}</>
              )}
            </p>
            <p className="truncate text-xs text-ink-muted">{r.reason}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tabular-nums text-ink dark:text-night-ink">{formatDurationMinutes(r.minutes)}</span>
            {r.approvalRequestId ? (
              <Link href={`/approvals/${r.approvalRequestId}`}>
                <Badge tone={STATUS_TONE[r.status]}>{t(`otx.status.${r.status}`)}</Badge>
              </Link>
            ) : (
              <Badge tone={STATUS_TONE[r.status]}>{t(`otx.status.${r.status}`)}</Badge>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
