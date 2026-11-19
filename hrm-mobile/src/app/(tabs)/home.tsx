import { MaterialIcons } from '@expo/vector-icons';
import { interpolate } from '@hrm/shared';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View } from 'react-native';
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
  { titleKey: 'nav.org', route: '/org', icon: 'account-tree', chip: 'bg-violet-50', color: '#7C3AED', testID: 'open-org' },
  { titleKey: 'lcal.title', route: '/leave-calendar', icon: 'calendar-month', chip: 'bg-indigo-50', color: '#4F46E5', testID: 'open-leave-calendar' },
];

/**
 * Smooth progress ring built from two clipped half-arcs (no SVG dependency), so the stroke is
 * one continuous anti-aliased border instead of many tick marks. Values are the existing ledger
 * amounts, never recomputed entitlements.
 */
const RING = 84;
const STROKE = 8;
function HalfArc({ side, rotate, color }: { side: 'left' | 'right'; rotate: number; color: string }) {
  // The arc starts in the opposite half (hidden by the clip) and rotates into view.
  const arc = side === 'right'
    ? { borderLeftColor: color, borderBottomColor: color, borderTopColor: 'transparent', borderRightColor: 'transparent' }
    : { borderTopColor: color, borderRightColor: color, borderLeftColor: 'transparent', borderBottomColor: 'transparent' };
  return (
    <View style={{ position: 'absolute', top: 0, width: RING / 2, height: RING, overflow: 'hidden', left: side === 'right' ? RING / 2 : 0 }}>
      <View style={{ position: 'absolute', top: 0, left: side === 'right' ? -RING / 2 : 0, width: RING, height: RING, borderRadius: RING / 2, borderWidth: STROKE, ...arc, transform: [{ rotate: `${45 + rotate}deg` }] }} />
    </View>
  );
}

function BalanceRing({ remaining, total, color }: { remaining: number; total: number; color: string }) {
  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const degrees = fraction * 360;
  const cap = (angle: number) => {
    const r = (RING - STROKE) / 2;
    const rad = (angle * Math.PI) / 180;
    return { position: 'absolute' as const, width: STROKE, height: STROKE, borderRadius: STROKE / 2, backgroundColor: color, left: RING / 2 + Math.sin(rad) * r - STROKE / 2, top: RING / 2 - Math.cos(rad) * r - STROKE / 2 };
  };
  return (
    <View accessible accessibilityLabel={`${remaining}/${total}`} style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: STROKE, borderColor: `${color}22` }} />
      {fraction > 0 && (
        <>
          <HalfArc side="right" rotate={Math.min(degrees, 180)} color={color} />
          {degrees > 180 && <HalfArc side="left" rotate={degrees - 180} color={color} />}
          {/* Rounded caps at both ends for a softer, modern stroke. */}
          {fraction < 1 && <View style={cap(0)} />}
          {fraction < 1 && <View style={cap(degrees)} />}
        </>
      )}
      <View className="bg-white dark:bg-night-surface" style={{ width: RING - STROKE * 2 - 6, height: RING - STROKE * 2 - 6, borderRadius: RING, alignItems: 'center', justifyContent: 'center', shadowColor: color, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
        <Text className="text-base font-bold" style={{ color, fontVariant: ['tabular-nums'] }}>{remaining}</Text>
        <Text className="text-[10px] text-ink-muted" style={{ fontVariant: ['tabular-nums'] }}>/ {total}</Text>
      </View>
    </View>
  );
}

const RING_COLORS = ['#F59E0B', '#3B5BFD', '#10B981'];

/** Soft bubble that drifts side to side behind the profile card; still when Reduce Motion is on. */
function DriftingBubble({ size, distance, duration, style }: { size: number; distance: number; duration: number; style: object }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(x, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(x, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      loop.start();
    }).catch(() => undefined);
    return () => { cancelled = true; loop?.stop(); };
  }, [x, duration]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-distance, distance] });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.07)', transform: [{ translateX }] }, style]} />;
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
      <Pressable accessibilityRole="button" accessibilityLabel={t('nav.profile')} onPress={() => router.push('/profile')} testID="home-profile" className="mb-6 overflow-hidden rounded-3xl p-5" style={{ backgroundColor: '#34499E', shadowColor: '#34499E', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
        <DriftingBubble size={176} distance={18} duration={3200} style={{ right: -32, top: -40 }} />
        <DriftingBubble size={144} distance={24} duration={4200} style={{ right: 40, bottom: -48 }} />
        <DriftingBubble size={64} distance={14} duration={2600} style={{ left: 96, top: -20 }} />
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
                      <BalanceRing remaining={balance.balance} total={total} color={RING_COLORS[index % RING_COLORS.length] ?? '#F59E0B'} />
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
          <Pressable key={shortcut.route} accessibilityRole="button" testID={shortcut.testID} onPress={() => router.push(shortcut.route)} className="w-1/4 items-center gap-2 rounded-xl px-1 py-3">
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
