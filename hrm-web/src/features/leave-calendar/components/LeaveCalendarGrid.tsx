'use client';
import { interpolate, leaveCalendarDay, type LeaveCalendarResponse } from '@hrm/shared';
import { cn } from '@/lib/cn';
import { usePrefsStore, useT } from '@/lib/i18n';
import { formatWeekday, localName } from '../format';
import { LeaveEntryChip } from './LeaveEntryChip';

export interface LeaveCalendarGridProps {
  data: Pick<LeaveCalendarResponse, 'entries' | 'holidays' | 'restDays' | 'today'>;
  /** Rows of 7 dates (Mon..Sun): one row for a week, 4–6 for a month (FR-LV-13.3). */
  weeks: readonly (readonly string[])[];
  /** `YYYY-MM` in month view: dates of other months are dimmed. */
  month?: string;
  /** Chips per cell before "+N more" (month view); unlimited when omitted. */
  maxPerCell?: number;
  /** Open the day list for a date (click on a cell or "+N more"). */
  onSelectDate?(date: string): void;
}

/**
 * Week / month grid of who is off (FR-LV-13.3): holidays shaded red, weekly rest days grey (FR-LV-13.8), today
 * outlined. Desktop/tablet: 7 columns. Phone: the week becomes a stacked day list and month cells show a count only.
 */
export function LeaveCalendarGrid({ data, weeks, month, maxPerCell, onSelectDate }: LeaveCalendarGridProps) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const isMonth = !!month;

  return (
    <div data-testid={isMonth ? 'lcal-month' : 'lcal-week'} className="flex flex-col gap-1">
      <div className={cn('hidden grid-cols-7 gap-1 text-center text-xs font-medium text-ink-muted sm:grid')}>
        {weeks[0]?.map((d) => <div key={d}>{formatWeekday(d, locale)}</div>)}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className={cn('grid gap-1', isMonth ? 'grid-cols-7' : 'grid-cols-1 sm:grid-cols-7')}>
          {week.map((date) => {
            const day = leaveCalendarDay(data, date);
            const outside = isMonth && date.slice(0, 7) !== month;
            const shown = maxPerCell === undefined ? day.entries : day.entries.slice(0, maxPerCell);
            const hidden = day.entries.length - shown.length;
            return (
              <div
                key={date}
                data-testid="lcal-day"
                data-date={date}
                data-holiday={day.holidays.length > 0 || undefined}
                data-rest={day.isRestDay || undefined}
                data-count={day.entries.length}
                role={onSelectDate ? 'button' : undefined}
                tabIndex={onSelectDate ? 0 : undefined}
                onClick={() => onSelectDate?.(date)}
                onKeyDown={(e) => {
                  if (onSelectDate && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelectDate(date);
                  }
                }}
                className={cn(
                  'flex min-w-0 flex-col gap-1 rounded-sm border border-line p-1.5 text-left dark:border-night-line',
                  isMonth ? 'min-h-14 sm:min-h-24' : 'min-h-16 sm:min-h-40',
                  day.holidays.length ? 'bg-danger-soft' : day.isRestDay ? 'bg-canvas dark:bg-night-canvas' : 'bg-white dark:bg-night-surface',
                  outside && 'opacity-40',
                  date === data.today && 'ring-2 ring-primary',
                  onSelectDate && 'cursor-pointer hover:border-primary',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-ink dark:text-night-ink">
                    <span className={cn(isMonth ? 'hidden' : 'sm:hidden', 'mr-1 font-normal text-ink-muted')}>{formatWeekday(date, locale)}</span>
                    {Number(date.slice(8))}
                  </span>
                  {isMonth && day.entries.length > 0 && (
                    <span data-testid="lcal-day-count" className="rounded-full bg-primary-soft px-1.5 text-[10px] font-semibold text-primary sm:hidden">
                      {day.entries.length}
                    </span>
                  )}
                </div>
                {day.holidays.map((h) => (
                  <span key={h.nameEn} data-testid="lcal-holiday" className="truncate text-[11px] font-medium text-danger" title={localName(h, locale)}>
                    {localName(h, locale)}
                    {h.womenOnly && ' ♀'}
                  </span>
                ))}
                {day.isRestDay && !day.holidays.length && !isMonth && (
                  <span className="text-[11px] text-ink-muted">{t('lcal.restDay')}</span>
                )}
                <div className={cn('flex flex-col gap-1', isMonth && 'hidden sm:flex')}>
                  {shown.map((e) => (
                    <LeaveEntryChip key={e.requestId} entry={e} compact={isMonth} />
                  ))}
                  {hidden > 0 && (
                    <span data-testid="lcal-more" className="text-[11px] font-medium text-primary">
                      {interpolate(t('lcal.more'), { count: hidden })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
