import { Redirect, router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, QueryView, Screen } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { useLeaveTypes, useMyLeaveBalances, useMyLeaveRequests } from '@/features/leave/api';
import { LeaveBalanceRows, LeaveRequestRows } from '@/features/leave/LeaveViews';
import { useT } from '@/lib/i18n';

/** My leave (FR-LV-06.2, FR-LV-09): yearly balances and own requests, opened from home or a notification. */
export default function LeaveScreen() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const balances = useMyLeaveBalances();
  const types = useLeaveTypes();
  const requests = useMyLeaveRequests();
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="leave-screen">
      <Button title={t('common.back')} variant="ghost" onPress={() => router.back()} testID="leave-back" />
      <Text className="mb-4 text-2xl font-semibold text-ink dark:text-night-ink">{t('lvr.mine.title')}</Text>
      <Button title={t('lvr.new')} onPress={() => router.push('/leave/new')} testID="leave-new" className="mb-4" />
      <View className="gap-4">
        <QueryView query={balances}>{(data) => <LeaveBalanceRows year={data.year} balances={data.balances} types={types.data ?? []} />}</QueryView>
        <Text className="text-base font-semibold text-ink dark:text-night-ink">{t('lvr.requests.title')}</Text>
        <QueryView query={requests}>{(items) => <LeaveRequestRows items={items} onOpen={(id) => router.push(`/leave/${id}`)} />}</QueryView>
      </View>
    </Screen>
  );
}
