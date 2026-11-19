import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, EmployeeHeader, QueryView, Screen } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { useLeaveTypes, useMyLeaveBalances, useMyLeaveRequests } from '@/features/leave/api';
import { LeaveBalanceRows, LeaveRequestRows } from '@/features/leave/LeaveViews';
import { LeaveCalendarPanel } from '@/features/leave-calendar/LeaveCalendarPanel';
import { usePrefsStore, useT } from '@/lib/i18n';

type LeaveTab = 'overview' | 'requests' | 'balances';
// Screen-only labels; the existing shared leave copy remains unchanged.
const TAB_LABELS = {
  lo: { overview: 'ພາບລວມ', requests: 'ຄຳຂໍຂອງຂ້ອຍ', balances: 'ວັນລາຄົງເຫຼືອ' },
  en: { overview: 'Overview', requests: 'My requests', balances: 'Balances' },
} as const;

/** Calendar-first leave landing, with the original personal requests and balances one tap away. */
export default function LeaveScreen() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const token = useAuthStore((s) => s.accessToken);
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<LeaveTab>(() => params.tab === 'balances' || params.tab === 'requests' ? params.tab : 'overview');
  const balances = useMyLeaveBalances();
  const types = useLeaveTypes();
  const requests = useMyLeaveRequests();
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="leave-screen" header={<EmployeeHeader title={t('lcal.title')} back testID="leave" />}>
      <View accessibilityRole="tablist" className="mb-4 flex-row border-b border-line dark:border-night-line">
        {(['overview', 'requests', 'balances'] as const).map((value) => (
          <Pressable
            key={value}
            testID={`leave-tab-${value}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            onPress={() => setTab(value)}
            className={`min-h-12 flex-1 items-center justify-center border-b-2 px-1 py-3 ${tab === value ? 'border-primary' : 'border-transparent'}`}
          >
            <Text className={`text-center text-sm font-semibold ${tab === value ? 'text-primary' : 'text-ink-muted dark:text-night-muted'}`}>{TAB_LABELS[locale][value]}</Text>
          </Pressable>
        ))}
      </View>
      <Button title={t('lvr.new')} onPress={() => router.push('/leave/new')} testID="leave-new" className="mb-4" />
      {/* Keep the calendar mounted so switching tabs does not lose the selected month/day. */}
      <View style={tab === 'overview' ? undefined : { display: 'none' }} accessibilityElementsHidden={tab !== 'overview'} importantForAccessibility={tab === 'overview' ? 'auto' : 'no-hide-descendants'}>
        <LeaveCalendarPanel />
      </View>
      {tab === 'requests' && (
        <View className="gap-4">
          <Text accessibilityRole="header" className="text-base font-semibold text-ink dark:text-night-ink">{t('lvr.requests.title')}</Text>
          <QueryView query={requests}>{(items) => <LeaveRequestRows items={items} onOpen={(id) => router.push(`/leave/${id}`)} />}</QueryView>
        </View>
      )}
      {tab === 'balances' && (
        <QueryView query={balances}>{(data) => <LeaveBalanceRows year={data.year} balances={data.balances} types={types.data ?? []} />}</QueryView>
      )}
    </Screen>
  );
}
