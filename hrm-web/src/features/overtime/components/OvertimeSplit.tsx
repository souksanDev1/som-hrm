'use client';
import { formatDurationMinutes, interpolate, OVERTIME_CATEGORIES, overtimeCategoryKey, type OvertimePreview } from '@hrm/shared';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

type Split = Record<(typeof OVERTIME_CATEGORIES)[number], number>;

export interface OvertimeSplitListProps {
  split: Split;
  totalMinutes: number;
  className?: string;
  'data-testid'?: string;
}

/** The four OT categories (FR-ATT-21) and their total, in h:mm. */
export function OvertimeSplitList({ split, totalMinutes, className, ...rest }: OvertimeSplitListProps) {
  const t = useT();
  return (
    <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5', className)} data-testid={rest['data-testid']}>
      {OVERTIME_CATEGORIES.map((c) => (
        <div key={c} className="flex flex-col">
          <dt className="text-xs text-ink-muted">{t(overtimeCategoryKey(c))}</dt>
          <dd className="tabular-nums text-ink dark:text-night-ink" data-testid={rest['data-testid'] ? `${rest['data-testid']}-${c}` : undefined}>
            {formatDurationMinutes(split[c])}
          </dd>
        </div>
      ))}
      <div className="flex flex-col">
        <dt className="text-xs text-ink-muted">{t('otx.total')}</dt>
        <dd className="font-semibold tabular-nums text-ink dark:text-night-ink" data-testid={rest['data-testid'] ? `${rest['data-testid']}-total` : undefined}>
          {formatDurationMinutes(totalMinutes)}
        </dd>
      </div>
    </dl>
  );
}

export interface OvertimeCapLineProps {
  label: string;
  status: OvertimePreview['day'];
  warnPercent: number;
  'data-testid'?: string;
}

/** Usage of one cap (day or month) with the warning / over-limit badge (FR-ATT-22). */
export function OvertimeCapLine({ label, status, warnPercent, ...rest }: OvertimeCapLineProps) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid={rest['data-testid']}>
      <span className="text-ink-muted">{label}</span>
      <span className="flex items-center gap-2 tabular-nums text-ink dark:text-night-ink">
        {interpolate(t('otx.cap.usage'), { total: formatDurationMinutes(status.total), cap: formatDurationMinutes(status.cap) })}
        {status.exceeded ? (
          <Badge tone="danger">{t('otx.cap.exceeded')}</Badge>
        ) : status.warn ? (
          <Badge tone="warning">{interpolate(t('otx.cap.warn'), { percent: warnPercent })}</Badge>
        ) : null}
      </span>
    </div>
  );
}
