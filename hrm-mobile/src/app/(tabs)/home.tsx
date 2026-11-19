import { MaterialIcons } from '@expo/vector-icons';
import { interpolate } from '@hrm/shared';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Card, EmployeeAvatar, EmployeeHeader, QueryView, Screen } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { useLeaveTypes, useMyLeaveBalances } from '@/features/leave/api';
import { useLeaveTypeName } from '@/features/leave/LeaveViews';
import { useUnreadCount } from '@/features/notifications/api';
import { useMyProfile } from '@/features/profile/api';
import { usePrefsStore, useT } from '@/lib/i18n';

type IconName = keyof typeof MaterialIcons.glyphMap;

// Keep the original shortcut destinations and individual icon colours.
const shortcuts: { titleKey: string; route: string; icon: IconName; chip: string; color: string; testID?: string }[] = [
  { titleKey: 'nav.leave', route: '/leave', icon: 'event-busy', chip: 'bg-amber-50', color: '#D97706', testID: 'open-leave' },
  { titleKey: 'otx.mine.title', route: '/overtime', icon: 'schedule', chip: 'bg-rose-50', color: '#E11D48', testID: 'open-overtime' },
  { titleKey: 'nav.attendance', route: '/checkin', icon: 'fingerprint', chip: 'bg-sky-50', color: '#0284C7', testID: 'open-attendance' },
  { titleKey: 'nav.approvals', route: '/approvals', icon: 'fact-check', chip: 'bg-emerald-50', color: '#059669', testID: 'open-approvals' },
  { titleKey: 'nav.profile', route: '/profile', icon: 'person-outline', chip: 'bg-sky-50', color: '#0284C7' },
  { titleKey: 'nav.org', route: '/org', icon: 'account-tree', chip: 'bg-violet-50', color: '#7C3AED' },
  { titleKey: 'lcal.title', route: '/leave-calendar', icon: 'calendar-month', chip: 'bg-indigo-50', color: '#4F46E5', testID: 'open-leave-calendar' },
];

/** Small native-only ring; values are the existing ledger amounts, never recomputed entitlements. */
function BalanceRing({ remaining, total, color }: { remaining: number; total: number; color: string }) {
  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return (
    <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 7, borderColor: '#DBE3E8' }} />
      {Array.from({ length: Math.round(fraction * 90) }, (_, index) => {
        const angle = index * 4;
        const radians = angle * Math.PI / 180;
        return <View key={index} accessible={false} style={{ position: 'absolute', width: 3.6, height: 7, borderRadius: 1, backgroundColor: color, left: 38.2 + Math.sin(radians) * 36.5, top: 36.5 - Math.cos(radians) * 36.5, transform: [{ rotate: `${angle}deg` }] }} />;
      })}
      <Text className="text-sm font-semibold text-ink dark:text-night-ink">{remaining}/{total}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const profile = useMyProfile();
  const balances = useMyLeaveBalances();
  const types = useLeaveTypes();
  const typeName = useLeaveTypeName();
  const unread = useUnreadCount().data?.count ?? 0;
  const employee = profile.data;
  const name = employee ? `${employee.firstName} ${employee.lastName}` : user?.displayName;
  const viewAll = locale === 'lo' ? 'ເບິ່ງທັງໝົດ' : 'View all';
  return (
    <Screen testID="home-screen" header={<EmployeeHeader title={user?.workspaceName ?? t('app.name')} unread={unread} testID="home-header" />}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('nav.profile')} onPress={() => router.push('/profile')} testID="home-profile" className="mb-6 overflow-hidden rounded-2xl p-5" style={{ backgroundColor: '#34499E' }}>
        <View className="absolute -right-8 -top-10 h-44 w-44 rounded-full bg-white/5" />
        <View className="absolute -bottom-12 right-10 h-36 w-36 rounded-full bg-white/5" />
        <View className="flex-row items-center gap-4">
          <EmployeeAvatar name={name} size={76} testID="home-avatar" />
          <View className="flex-1">
            <Text className="text-xl font-bold text-white" testID="home-greeting">{name ?? '…'}</Text>
            <Text className="mt-1 text-sm leading-6 text-white/90">{[employee?.position?.name, employee?.department?.name].filter(Boolean).join(' · ') || user?.workspaceName}</Text>
            {employee?.employeeCode && <Text className="mt-1 text-sm text-white/80" testID="home-employee-code">{employee.employeeCode}</Text>}
          </View>
        </View>
      </Pressable>

      <Card title={interpolate(t('lvr.balances.title'), { year: balances.data?.year ?? new Date().getFullYear() })} right={
        <Pressable accessibilityRole="button" onPress={() => router.push('/leave?tab=balances')} testID="home-view-balances" className="min-h-11 justify-center pl-2">
          <Text className="text-sm font-semibold text-primary">{viewAll}</Text>
        </Pressable>
      }>
        <QueryView query={balances}>
          {(data) => {
            const yearly = data.balances.filter((b) => b.quotaPeriod === 'YEARLY').slice(0, 3);
            return yearly.length ? (
              <View className="flex-row flex-wrap justify-around gap-y-4 py-3">
                {yearly.map((balance, index) => {
                  const type = types.data?.find((item) => item.id === balance.leaveTypeId);
                  const total = balance.entitled + balance.carried + balance.adjusted;
                  return (
                    <View key={balance.leaveTypeId} className="w-1/3 min-w-[86px] items-center gap-2 px-1" testID={`home-balance-${balance.leaveTypeId}`}>
                      <BalanceRing remaining={balance.balance} total={total} color={index === 0 ? '#F59E0B' : '#34499E'} />
                      <Text className="text-center text-xs font-medium text-ink dark:text-night-ink" numberOfLines={2}>{type ? typeName(type) : '—'}</Text>
                    </View>
                  );
                })}
              </View>
            ) : <Text className="py-4 text-center text-sm text-ink-muted">{locale === 'lo' ? 'ຍັງບໍ່ມີຍອດວັນລາ' : 'No leave balances yet'}</Text>;
          }}
        </QueryView>
        <Text className="mt-1 text-center text-xs text-ink-muted">{t('lvr.balance.remaining')} / {t('lvr.balance.entitled')}</Text>
      </Card>

      <View className="mb-3 mt-2 flex-row items-center gap-3">
        <View className="h-6 w-1 rounded-full bg-primary" />
        <Text className="text-lg font-semibold text-ink dark:text-night-ink">{locale === 'lo' ? 'ເມນູດ່ວນ' : 'Quick access'}</Text>
      </View>
      <View className="flex-row flex-wrap pb-4">
        {shortcuts.map((shortcut) => (
          <Pressable key={shortcut.route} accessibilityRole="button" testID={shortcut.testID} onPress={() => router.push(shortcut.route)} className="w-1/4 items-center gap-2 rounded-xl px-1 py-3 active:bg-primary-soft">
            <View className={`h-14 w-14 items-center justify-center rounded-full ${shortcut.chip}`}>
              <MaterialIcons name={shortcut.icon} size={27} color={shortcut.color} />
            </View>
            <Text className="text-center text-xs font-medium text-ink dark:text-night-ink" numberOfLines={2}>{t(shortcut.titleKey)}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
