import { leaveCalendarRange, monthGrid, shiftLeaveCalendarAnchor, weekDates, type LeaveCalendarView } from '@hrm/shared';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, QueryView, Segmented } from '@/components/ui';
import { deviceToday, useLeaveCalendar } from './api';
import { formatDay, LeaveDayList, LeaveLegend, LeaveMonthGrid, LeaveWeekList } from './LeaveCalendarViews';
import { usePrefsStore, useT } from '@/lib/i18n';

/** Shared calendar for the leave overview and the standalone calendar. Visibility stays API-owned. */
export function LeaveCalendarPanel({ showViewSwitcher = false }: { showViewSwitcher?: boolean }) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const [view, setView] = useState<LeaveCalendarView>('month');
  const [anchor, setAnchor] = useState(deviceToday);
  const range = leaveCalendarRange(view, anchor);
  const query = useLeaveCalendar(range);
  const period = view === 'month'
    ? new Date(`${anchor}T00:00:00Z`).toLocaleDateString(locale === 'lo' ? 'lo-LA' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : view === 'today' ? formatDay(anchor, locale) : `${formatDay(range.from, locale)} – ${formatDay(range.to, locale)}`;

  return (
    <View>
      {showViewSwitcher && (
        <Segmented<LeaveCalendarView>
          value={view}
          onChange={setView}
          options={(['today', 'week', 'month'] as const).map((v) => ({ value: v, label: t(`lcal.view.${v}`), testID: `lcal-view-${v}` }))}
        />
      )}
      <View className="my-3 flex-row items-center justify-between gap-1">
        <Button title="‹" variant="secondary" onPress={() => setAnchor((a) => shiftLeaveCalendarAnchor(view, a, -1))} testID="lcal-prev" accessibilityLabel={t('lcal.prev')} />
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" className="flex-1 text-center text-lg font-semibold text-ink dark:text-night-ink" testID="lcal-period">
          {period}
        </Text>
        <Button title="›" variant="secondary" onPress={() => setAnchor((a) => shiftLeaveCalendarAnchor(view, a, 1))} testID="lcal-next" accessibilityLabel={t('lcal.next')} />
      </View>
      <QueryView query={query}>
        {(data) => (
          <>
            <Text className="mb-3 text-xs text-ink-muted dark:text-night-muted">
              {t(data.viewer.allDepartments ? 'lcal.scope.all' : data.viewer.canSeePending ? 'lcal.scope.team' : 'lcal.scope.department')}
            </Text>
            {view === 'month' ? (
              <>
                <View className="rounded-lg border border-line bg-white p-2 dark:border-night-line dark:bg-night-surface">
                  <LeaveMonthGrid data={data} weeks={monthGrid(anchor.slice(0, 7))} month={anchor.slice(0, 7)} selected={anchor} onSelect={setAnchor} />
                </View>
                <LeaveLegend data={data} />
                <View className="mt-4">
                  <Card>
                    <LeaveDayList data={data} date={anchor} />
                  </Card>
                </View>
              </>
            ) : (
              <Card>
                {view === 'today' ? <LeaveDayList data={data} date={anchor} testID="lcal-today" /> : <LeaveWeekList data={data} dates={weekDates(anchor)} />}
                <LeaveLegend data={data} />
              </Card>
            )}
          </>
        )}
      </QueryView>
      <Button title={t('lcal.goToday')} variant="secondary" onPress={() => setAnchor(query.data?.today ?? deviceToday())} testID="lcal-go-today" />
    </View>
  );
}
