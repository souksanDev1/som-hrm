import { MaterialIcons } from '@expo/vector-icons';
import { laoProvinceName } from '@hrm/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { EmployeeAvatar, EmployeeHeader, InfoRow, QueryView, Screen } from '@/components/ui';
import { useChangeLocale, useLogout } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { useMyProfile } from '@/features/profile/api';
import { ExpiryBadge } from '@/features/profile/ExpiryBadge';
import { MyWorkScheduleCard } from '@/features/schedule/MyWorkScheduleCard';
import { usePrefsStore, useT } from '@/lib/i18n';

function ProfileMenuRow({
  title, icon, onPress, testID, expanded, detail, danger = false, last = false,
}: {
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  testID: string;
  expanded?: boolean;
  detail?: string;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      testID={testID}
      onPress={onPress}
      className={`min-h-[68px] flex-row items-center gap-3 px-4 py-4 active:bg-canvas dark:active:bg-night-canvas ${last ? '' : 'border-b border-line dark:border-night-line'}`}
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
        {detail ? <Text className="mt-1 text-sm text-ink-muted">{detail}</Text> : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <MaterialIcons name={expanded ? 'expand-less' : expanded === false ? 'expand-more' : 'chevron-right'} size={24} color="#94A3B8" />
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const t = useT();
  const profile = useMyProfile();
  const logout = useLogout();
  const locale = usePrefsStore((s) => s.locale);
  const changeLocale = useChangeLocale();
  const method = useAuthStore((s) => s.lastLoginMethod);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

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
        <ProfileMenuRow
          title={locale === 'lo' ? 'ຂໍ້ມູນສ່ວນຕົວ' : 'Personal information'}
          icon="person-outline"
          testID="toggle-personal-info"
          expanded={personalOpen}
          onPress={() => setPersonalOpen((open) => !open)}
        />
        {personalOpen && (
          <View className="border-b border-line px-4 pb-4 dark:border-night-line">
            <QueryView query={profile}>
              {(e) => (
                <>
                  <InfoRow label={t('employee.code')} value={e.employeeCode} testID="profile-code" />
                  <InfoRow label={t('empx.nameEn')} value={[e.firstNameEn, e.lastNameEn].filter(Boolean).join(' ') || null} testID="profile-name-en" />
                  <InfoRow label={t('employee.position')} value={e.position?.name} />
                  <InfoRow label={t('employee.department')} value={e.department?.name} />
                  <InfoRow label={t('employee.branch')} value={e.branch?.name} />
                  <InfoRow label={t('employee.hireDate')} value={e.hireDate} />
                  <InfoRow label={t('empx.contractType')} value={t(`empx.contractType.${e.contractType}`)} testID="profile-contract-type" />
                  <InfoRow label={t('empx.payType')} value={t(`empx.payType.${e.payType}`)} testID="profile-pay-type" />
                  <InfoRow label={t('employee.phone')} value={e.phone} />
                  <InfoRow
                    label={t('empx.address.title')}
                    value={[e.village, e.district, laoProvinceName(e.province, locale)].filter(Boolean).join(', ') || null}
                    testID="profile-address"
                  />
                  <InfoRow label={t('employee.socialSecurityNo')} value={e.socialSecurityNo} testID="profile-ssn" />
                  <InfoRow label={t('employee.familyBookNo')} value={e.familyBookNo} />
                  {e.documents.length > 0 && (
                    <View className="mt-4">
                      <Text className="mb-2 text-base font-semibold text-ink dark:text-night-ink">{t('employee.documents')}</Text>
                      {e.documents.map((d) => (
                        <View key={d.id} className="flex-row items-center justify-between gap-2 border-b border-line py-2.5 dark:border-night-line">
                          <View className="flex-1">
                            <Text className="text-sm font-medium text-ink dark:text-night-ink">{t(`document.${d.type}`)}</Text>
                            <Text className="text-xs text-ink-muted">{d.expiresAt ?? '—'}</Text>
                          </View>
                          <ExpiryBadge expiryStatus={d.expiryStatus} expiryThresholdDays={d.expiryThresholdDays} />
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </QueryView>
          </View>
        )}
        <ProfileMenuRow title={t('org.title')} icon="account-tree" testID="open-org" onPress={() => router.push('/org')} />
        <ProfileMenuRow title={t('nav.notifications')} icon="notifications-none" testID="open-notifications" onPress={() => router.push('/notifications')} />
        <ProfileMenuRow title={t('schedule.mine')} icon="date-range" testID="toggle-work-schedule" expanded={scheduleOpen} onPress={() => setScheduleOpen((open) => !open)} />
        {/* Keep the schedule mounted so its existing query lifecycle is unchanged. */}
        <View className={scheduleOpen ? 'border-b border-line px-3 pt-3 dark:border-night-line' : 'hidden'} accessibilityElementsHidden={!scheduleOpen} importantForAccessibility={scheduleOpen ? 'auto' : 'no-hide-descendants'}>
          <MyWorkScheduleCard />
        </View>
        <ProfileMenuRow title={t('holiday.thisYear')} icon="event" onPress={() => router.push('/holidays')} testID="open-holidays" />
        <ProfileMenuRow title={t('attreq.correction.open')} icon="edit-calendar" onPress={() => router.push('/attendance/correction')} testID="open-correction" />
        <ProfileMenuRow title={t('attreq.deviceChange.open')} icon="phonelink-setup" onPress={() => router.push('/attendance/change-device')} testID="open-change-device" />
        {method === 'PIN' && <ProfileMenuRow title={t('auth.changePin')} icon="lock-outline" onPress={() => router.push('/change-pin')} testID="open-change-pin" />}
        <ProfileMenuRow
          title={t('authx.account.language')}
          detail={locale === 'lo' ? 'English' : 'ພາສາລາວ'}
          icon="language"
          onPress={() => changeLocale(locale === 'lo' ? 'en' : 'lo')}
          testID="toggle-locale"
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
