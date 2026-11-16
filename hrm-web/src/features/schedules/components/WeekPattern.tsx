'use client';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { DAY_ORDER, formatHours } from '../format';

export interface WeekPatternProps {
  /** Hours per weekday, index 0 = Sunday … 6 = Saturday; 0 = rest day. */
  dayHours: readonly number[];
  className?: string;
  'data-testid'?: string;
}

/** Read-only week strip (Mon → Sun) showing scheduled hours or "off" for each day. */
export function WeekPattern({ dayHours, className, 'data-testid': testId }: WeekPatternProps) {
  const t = useT();
  return (
    <ol className={cn('grid grid-cols-7 gap-1', className)} data-testid={testId}>
      {DAY_ORDER.map((d) => {
        const h = dayHours[d] ?? 0;
        return (
          <li
            key={d}
            data-testid={`day-${d}`}
            className={cn(
              'flex min-w-0 flex-col items-center rounded-sm border px-0.5 py-1.5 text-center',
              h > 0 ? 'border-primary/20 bg-primary-soft text-primary' : 'border-line bg-canvas text-ink-muted dark:border-night-line dark:bg-night-line',
            )}
          >
            <span className="w-full truncate text-[11px] leading-tight">{t(`schedule.day.${d}`)}</span>
            <span className="text-sm font-semibold tabular-nums">{h > 0 ? formatHours(h) : t('schedule.restDay')}</span>
          </li>
        );
      })}
    </ol>
  );
}
