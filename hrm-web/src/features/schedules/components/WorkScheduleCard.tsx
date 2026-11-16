'use client';
import type { EmployeeWorkSchedule } from '@hrm/shared';
import { Badge, Card, QueryState } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';
import { formatPatternSummary } from '../format';
import { useEmployeeWorkSchedule } from '../hooks';
import { WeekPattern } from './WeekPattern';

/** Presentational body: standard vs individual schedule, days and hours, upcoming changes (FR-WS-03.5). */
export function WorkScheduleView({ schedule }: { schedule: EmployeeWorkSchedule }) {
  const t = useT();
  const c = schedule.current;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={c.source === 'override' ? 'primary' : 'neutral'}>
          <span data-testid="schedule-source">{t(`schedule.source.${c.source}`)}</span>
        </Badge>
        <span className="text-sm font-semibold tabular-nums text-ink dark:text-night-ink" data-testid="schedule-summary">
          {formatPatternSummary(t, c)}
        </span>
      </div>
      <WeekPattern dayHours={c.dayHours} data-testid="schedule-week" />
      <p className="text-xs text-ink-muted">
        {[c.label, fill(t('schedule.since'), { date: c.effectiveFrom })].filter(Boolean).join(' · ')}
      </p>
      {schedule.upcoming.length > 0 && (
        <div data-testid="schedule-upcoming">
          <h3 className="mb-1 text-xs font-semibold uppercase text-ink-muted">{t('schedule.upcoming')}</h3>
          <ul className="flex flex-col gap-2">
            {schedule.upcoming.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 text-sm">
                <span className="tabular-nums text-ink dark:text-night-ink">
                  {fill(t('schedule.since'), { date: a.effectiveFrom })} · {a.dayHours ? (a.label ?? t('schedule.source.override')) : t('schedule.backToStandard')}
                </span>
                {a.dayHours && <WeekPattern dayHours={a.dayHours} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Working-schedule card on the employee detail page. */
export function WorkScheduleCard({ employeeId, className }: { employeeId: string; className?: string }) {
  const t = useT();
  const query = useEmployeeWorkSchedule(employeeId);
  return (
    <Card title={t('schedule.card.title')} data-testid="work-schedule-card" className={className}>
      <QueryState query={query}>{(s) => <WorkScheduleView schedule={s} />}</QueryState>
    </Card>
  );
}
