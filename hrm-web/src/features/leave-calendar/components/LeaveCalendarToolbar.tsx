'use client';
import { LEAVE_CALENDAR_VIEWS, type LeaveCalendarView } from '@hrm/shared';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

export interface LeaveCalendarToolbarProps {
  view: LeaveCalendarView;
  /** Localized label of the period on screen. */
  periodLabel: string;
  onViewChange(view: LeaveCalendarView): void;
  onPrev(): void;
  onNext(): void;
  onToday(): void;
}

/** Today / Week / Month toggle (FR-LV-13.2/13.3) with previous / next / back-to-today navigation. */
export function LeaveCalendarToolbar({ view, periodLabel, onViewChange, onPrev, onNext, onToday }: LeaveCalendarToolbarProps) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div role="tablist" aria-label={t('lcal.title')} className="inline-flex self-start rounded-sm border border-line p-0.5 dark:border-night-line">
        {LEAVE_CALENDAR_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            data-testid={`lcal-view-${v}`}
            onClick={() => onViewChange(v)}
            className={cn(
              'rounded-sm px-3 py-1.5 text-sm font-medium',
              view === v ? 'bg-primary text-white' : 'text-ink hover:bg-canvas dark:text-night-ink dark:hover:bg-night-line',
            )}
          >
            {t(`lcal.view.${v}`)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" icon="chevron_left" aria-label={t('lcal.prev')} onClick={onPrev} data-testid="lcal-prev" />
        <span data-testid="lcal-period" className="min-w-0 flex-1 text-center text-sm font-semibold text-ink dark:text-night-ink sm:min-w-44">
          {periodLabel}
        </span>
        <Button variant="secondary" size="sm" icon="chevron_right" aria-label={t('lcal.next')} onClick={onNext} data-testid="lcal-next" />
        <Button variant="ghost" size="sm" onClick={onToday} data-testid="lcal-go-today">
          {t('lcal.goToday')}
        </Button>
      </div>
    </div>
  );
}
