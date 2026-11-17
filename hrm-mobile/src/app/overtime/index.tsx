import { formatDurationMinutes, interpolate as fill } from '@hrm/shared';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, QueryView, Screen } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { localToday, shiftMonth, useMyOvertime } from '@/features/overtime/api';
import { OvertimeRequestRows, OvertimeSplitRows } from '@/features/overtime/OvertimeViews';
import { useT } from '@/lib/i18n';

/** My overtime this month: approved hours by category and every request (FR-ATT-23), opened from home. */
export default function OvertimeScreen() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const [month, setMonth] = useState(() => localToday().slice(0, 7));
  const query = useMyOvertime(month);
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="overtime-screen">
      <Button title={t('common.back')} variant="ghost" onPress={() => router.back()} testID="overtime-back" />
      <Text className="mb-1 text-2xl font-semibold text-ink dark:text-night-ink">{t('otx.mine.title')}</Text>
      <View className="mb-4 flex-row items-center justify-between">
        <Button title="‹" variant="ghost" onPress={() => setMonth((m) => shiftMonth(m, -1))} testID="ot-month-prev" accessibilityLabel={t('common.previous')} />
        <Text className="text-base font-medium text-ink dark:text-night-ink" testID="ot-month">
          {month}
        </Text>
        <Button title="›" variant="ghost" onPress={() => setMonth((m) => shiftMonth(m, 1))} testID="ot-month-next" accessibilityLabel={t('common.next')} />
      </View>
      <Button title={t('otx.mine.new')} onPress={() => router.push('/overtime/new')} testID="ot-new" className="mb-4" />
      <QueryView query={query}>
        {(data) => (
          <>
            <Card title={t('otx.mine.approved')} testID="ot-approved-card">
              <OvertimeSplitRows split={data.approved} totalMinutes={data.approved.totalMinutes} testID="ot-approved" />
              {data.pendingMinutes > 0 ? (
                <Text className="mt-2 text-xs text-ink-muted" testID="ot-pending">
                  {fill(t('otx.mine.pending'), { hours: formatDurationMinutes(data.pendingMinutes) })}
                </Text>
              ) : null}
            </Card>
            {data.items.length ? (
              <OvertimeRequestRows items={data.items} />
            ) : (
              <Text className="py-8 text-center text-sm text-ink-muted" testID="ot-empty">
                {t('otx.mine.empty')}
              </Text>
            )}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
