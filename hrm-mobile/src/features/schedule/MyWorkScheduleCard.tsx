import { formatScheduleHours, interpolate as fill, SCHEDULE_DAY_ORDER, type EmployeeWorkSchedule } from '@hrm/shared';
import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { Badge, Card, QueryView } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';

export const useMyWorkSchedule = () =>
  useQuery({ queryKey: ['me', 'work-schedule'], queryFn: () => apiFetch<EmployeeWorkSchedule>('/me/work-schedule') });

/** Read-only body: standard vs individual, hours per day (Mon → Sun) and the next change (FR-WS-03.5). */
export function WorkScheduleSummary({ schedule }: { schedule: EmployeeWorkSchedule }) {
  const t = useT();
  const c = schedule.current;
  const next = schedule.upcoming[0];
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <Badge testID="my-schedule-source" tone={c.source === 'override' ? 'primary' : 'neutral'} label={t(`schedule.source.${c.source}`)} />
        <Text testID="my-schedule-summary" className="text-sm font-semibold text-ink dark:text-night-ink">
          {fill(t('schedule.weekSummary'), { days: c.workingDays.length, hours: formatScheduleHours(c.weeklyHours) })}
        </Text>
      </View>
      <View className="flex-row gap-1">
        {SCHEDULE_DAY_ORDER.map((d) => {
          const h = c.dayHours[d] ?? 0;
          return (
            <View
              key={d}
              testID={`my-schedule-day-${d}`}
              className={`flex-1 items-center rounded-sm border py-1.5 ${h > 0 ? 'border-primary/20 bg-primary-soft' : 'border-line bg-canvas'}`}
            >
              <Text numberOfLines={1} className="text-[11px] text-ink-muted">
                {t(`schedule.day.${d}`)}
              </Text>
              <Text className={`text-sm font-semibold ${h > 0 ? 'text-primary' : 'text-ink-muted'}`}>
                {h > 0 ? formatScheduleHours(h) : t('schedule.restDay')}
              </Text>
            </View>
          );
        })}
      </View>
      <Text className="text-xs text-ink-muted">{[c.label, fill(t('schedule.since'), { date: c.effectiveFrom })].filter(Boolean).join(' · ')}</Text>
      {next && (
        <Text testID="my-schedule-next" className="text-xs font-medium text-warning">
          {fill(t('schedule.overrides.next'), {
            date: next.effectiveFrom,
            pattern: next.dayHours ? (next.label ?? t('schedule.source.override')) : t('schedule.backToStandard'),
          })}
        </Text>
      )}
    </View>
  );
}

/** "My working schedule" card for the profile tab. */
export function MyWorkScheduleCard() {
  const t = useT();
  const query = useMyWorkSchedule();
  return (
    <Card title={t('schedule.mine')} testID="my-work-schedule">
      <QueryView query={query}>{(s) => <WorkScheduleSummary schedule={s} />}</QueryView>
    </Card>
  );
}
