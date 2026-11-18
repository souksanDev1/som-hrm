'use client';
import { interpolate, leaveCalendarDay, type LeaveCalendarResponse } from '@hrm/shared';
import { Badge } from '@/components/ui';
import { usePrefsStore, useT } from '@/lib/i18n';
import { formatLongDate, localName } from '../format';
import { LeaveEntryChip } from './LeaveEntryChip';

/** "Who is off" on one date (FR-LV-13.2): holiday / rest-day notice, then every person off, full or half day. */
export function LeaveTodayList({ data, date }: { data: Pick<LeaveCalendarResponse, 'entries' | 'holidays' | 'restDays' | 'today'>; date: string }) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const day = leaveCalendarDay(data, date);
  const heading = date === data.today ? t('lcal.todayOff') : interpolate(t('lcal.offOn'), { date: formatLongDate(date, locale) });

  return (
    <section data-testid="lcal-today" data-date={date} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-ink dark:text-night-ink">{heading}</h2>
        <span className="text-sm text-ink-muted">{formatLongDate(date, locale)}</span>
      </div>
      {day.holidays.map((h) => (
        <p key={h.date + h.nameEn} data-testid="lcal-today-holiday" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {localName(h, locale)} — {t(h.womenOnly ? 'lcal.holidayWomenOnly' : 'lcal.holiday')}
        </p>
      ))}
      {day.isRestDay && (
        <p data-testid="lcal-today-rest" className="rounded-sm bg-canvas px-3 py-2 text-sm text-ink-muted dark:bg-night-canvas">
          {t('lcal.restDay')}
        </p>
      )}
      {day.entries.length === 0 ? (
        <p data-testid="lcal-today-empty" className="text-sm text-ink-muted">
          {t('lcal.nobodyOff')}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {day.entries.map((e) => (
            <li key={e.requestId} data-testid="lcal-today-row" className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <LeaveEntryChip entry={e} />
              </div>
              <Badge tone={e.halfDay === 'NONE' ? 'neutral' : 'primary'}>{t(`leave.halfDay.${e.halfDay}`)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
