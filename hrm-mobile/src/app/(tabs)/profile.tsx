import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { EmployeeAvatar, EmployeeHeader, QueryView, Screen } from '@/components/ui';
import { useLogout } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { useMyProfile } from '@/features/profile/api';
import { LANGUAGE_FLAGS } from '@/features/settings/OptionRow';
import { usePrefsStore, useT } from '@/lib/i18n';

function ProfileMenuRow({
  title, icon, onPress, testID, detail, danger = false, last = false,
}: {
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  testID: string;
  detail?: string;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      testID={testID}
      onPress={onPress}
      className={`min-h-[68px] flex-row items-center gap-3 px-4 py-4 ${last ? '' : 'border-b border-line dark:border-night-line'}`}
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${danger ? 'bg-danger-soft' : 'bg-primary-soft'}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <MaterialIcons name={icon} size={22} color={danger ? '#F04438' : '#2C3E91'} />
      </View>
      <View className="flex-1">
        <Text className={`text-base font-medium ${danger ? 'text-danger' : 'text-ink dark:text-night-ink'}`}>{title}</Text>
        {detail ? <Text className="mt-1 text-sm text-ink-muted dark:text-night-muted">{detail}</Text> : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <MaterialIcons name="chevron-right" size={24} color="#94A3B8" />
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const t = useT();
  const profile = useMyProfile();
  const logout = useLogout();
  const locale = usePrefsStore((s) => s.locale);
  const theme = usePrefsStore((s) => s.theme);
  const method = useAuthStore((s) => s.lastLoginMethod);

  return (
    <Screen testID="profile-screen" header={<EmployeeHeader title={t('nav.profile')} />}>
      <QueryView query={profile}>
        {(e) => (
          <View className="-mx-4 -mt-4 mb-5 items-center rounded-b-[32px] bg-[#2C3E91] px-6 pb-8 pt-4">
            <EmployeeAvatar name={`${e.firstName} ${e.lastName}`} size={92} testID="profile-avatar" />
            <Text className="mt-4 text-center text-2xl font-semibold text-white">{`${e.firstName} ${e.lastName}`}</Text>
            <Text className="mt-2 text-center text-sm text-white/90">
              {[e.position?.name, e.department?.name].filter(Boolean).join(' · ') || '—'}
            </Text>
            <View className="mt-3 rounded-full bg-white/15 px-4 py-1.5">
              <Text testID="profile-hero-code" className="text-sm font-medium text-white">{t('employee.code')}: {e.employeeCode}</Text>
            </View>
          </View>
        )}
      </QueryView>
      <View className="overflow-hidden rounded-3xl bg-white shadow-sm dark:bg-night-surface">
        <ProfileMenuRow title={t('authx.account.personal')} icon="person-outline" testID="open-personal-info" onPress={() => router.push('/me/personal')} />
        <ProfileMenuRow title={t('org.title')} icon="account-tree" testID="open-org" onPress={() => router.push('/org')} />
        <ProfileMenuRow title={t('nav.notifications')} icon="notifications-none" testID="open-notifications" onPress={() => router.push('/notifications')} />
        <ProfileMenuRow title={t('schedule.mine')} icon="date-range" testID="open-work-schedule" onPress={() => router.push('/me/schedule')} />
        <ProfileMenuRow title={t('holiday.thisYear')} icon="event" onPress={() => router.push('/holidays')} testID="open-holidays" />
        <ProfileMenuRow title={t('attreq.correction.open')} icon="edit-calendar" onPress={() => router.push('/attendance/correction')} testID="open-correction" />
        <ProfileMenuRow title={t('attreq.deviceChange.open')} icon="phonelink-setup" onPress={() => router.push('/attendance/change-device')} testID="open-change-device" />
        {method === 'PIN' && <ProfileMenuRow title={t('auth.changePin')} icon="lock-outline" onPress={() => router.push('/change-pin')} testID="open-change-pin" />}
        <ProfileMenuRow
          title={t('authx.account.language')}
          detail={`${LANGUAGE_FLAGS[locale]}  ${t(`authx.language.${locale}`)}`}
          icon="language"
          onPress={() => router.push('/me/language')}
          testID="open-language"
        />
        <ProfileMenuRow
          title={t('authx.account.appearance')}
          detail={t(`authx.theme.${theme}`)}
          icon="dark-mode"
          onPress={() => router.push('/me/appearance')}
          testID="open-appearance"
        />
        <ProfileMenuRow
          title={t('auth.logout')}
          icon="logout"
          danger
          last
          testID="logout"
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
        />
      </View>
    </Screen>
  );
}
