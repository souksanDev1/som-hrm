import { leaveCalendarRange, monthGrid, shiftLeaveCalendarAnchor, weekDates, type LeaveCalendarView } from '@hrm/shared';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, QueryView, Screen, Segmented } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { deviceToday, useLeaveCalendar } from '@/features/leave-calendar/api';
import { formatDay, LeaveDayList, LeaveLegend, LeaveMonthGrid, LeaveWeekList } from '@/features/leave-calendar/LeaveCalendarViews';
import { usePrefsStore, useT } from '@/lib/i18n';

/** Leave calendar (FR-LV-13): who is off today, this week or this month — opened from home. */
export default function LeaveCalendarScreen() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const token = useAuthStore((s) => s.accessToken);
  const [view, setView] = useState<LeaveCalendarView>('today');
  const [anchor, setAnchor] = useState(deviceToday);
  const range = leaveCalendarRange(view, anchor);
  const query = useLeaveCalendar(range);
  if (!token) return <Redirect href="/login" />;

  const period = view === 'today' ? formatDay(anchor, locale) : `${formatDay(range.from, locale)} – ${formatDay(range.to, locale)}`;

  return (
    <Screen testID="leave-calendar-screen">
      <Button title={t('common.back')} variant="ghost" onPress={() => router.back()} testID="lcal-back" />
      <Text className="mb-3 text-2xl font-semibold text-ink dark:text-night-ink">{t('lcal.title')}</Text>
      <Segmented<LeaveCalendarView>
        value={view}
        onChange={setView}
        options={(['today', 'week', 'month'] as const).map((v) => ({ value: v, label: t(`lcal.view.${v}`), testID: `lcal-view-${v}` }))}
      />
      <View className="my-3 flex-row items-center justify-between">
        <Button title="‹" variant="ghost" onPress={() => setAnchor((a) => shiftLeaveCalendarAnchor(view, a, -1))} testID="lcal-prev" accessibilityLabel={t('lcal.prev')} />
        <Text className="flex-1 text-center text-sm font-medium text-ink dark:text-night-ink" testID="lcal-period">
          {period}
        </Text>
        <Button title="›" variant="ghost" onPress={() => setAnchor((a) => shiftLeaveCalendarAnchor(view, a, 1))} testID="lcal-next" accessibilityLabel={t('lcal.next')} />
      </View>
      <QueryView query={query}>
        {(data) => (
          <Card>
            {view === 'today' && <LeaveDayList data={data} date={anchor} testID="lcal-today" />}
            {view === 'week' && <LeaveWeekList data={data} dates={weekDates(anchor)} />}
            {view === 'month' && (
              <>
                <LeaveMonthGrid data={data} weeks={monthGrid(anchor.slice(0, 7))} month={anchor.slice(0, 7)} selected={anchor} onSelect={setAnchor} />
                <View className="mt-3">
                  <LeaveDayList data={data} date={anchor} />
                </View>
              </>
            )}
            <LeaveLegend data={data} />
          </Card>
        )}
      </QueryView>
      <Button title={t('lcal.goToday')} variant="secondary" onPress={() => setAnchor(query.data?.today ?? deviceToday())} testID="lcal-go-today" />
    </Screen>
  );
}
