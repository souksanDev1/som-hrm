import { laoProvinceName } from '@hrm/shared';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Card, InfoRow, QueryView, Screen } from '@/components/ui';
import { useChangeLocale, useLogout } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { useMyProfile } from '@/features/profile/api';
import { ExpiryBadge } from '@/features/profile/ExpiryBadge';
import { usePrefsStore, useT } from '@/lib/i18n';

export default function ProfileScreen() {
  const t = useT();
  const profile = useMyProfile();
  const logout = useLogout();
  const locale = usePrefsStore((s) => s.locale);
  const changeLocale = useChangeLocale();
  const method = useAuthStore((s) => s.lastLoginMethod);

  return (
    <Screen testID="profile-screen">
      <Text className="mb-4 text-2xl font-semibold text-ink dark:text-night-ink">{t('nav.profile')}</Text>
      <QueryView query={profile}>
        {(e) => (
          <>
            <Card title={`${e.firstName} ${e.lastName}`}>
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
            </Card>
            {e.documents.length > 0 && (
              <Card title={t('employee.documents')}>
                {e.documents.map((d) => (
                  <View key={d.id} className="flex-row items-center justify-between gap-2 border-b border-line py-2.5 dark:border-night-line">
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-ink dark:text-night-ink">{t(`document.${d.type}`)}</Text>
                      <Text className="text-xs text-ink-muted">{d.expiresAt ?? '—'}</Text>
                    </View>
                    <ExpiryBadge expiryStatus={d.expiryStatus} expiryThresholdDays={d.expiryThresholdDays} />
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </QueryView>
      <Card>
        <View className="gap-2">
          {method === 'PIN' && <Button title={t('auth.changePin')} variant="secondary" onPress={() => router.push('/change-pin')} testID="open-change-pin" />}
          <Button title={locale === 'lo' ? 'English' : 'ພາສາລາວ'} variant="secondary" onPress={() => changeLocale(locale === 'lo' ? 'en' : 'lo')} testID="toggle-locale" />
          <Button
            title={t('auth.logout')}
            variant="danger"
            testID="logout"
            onPress={async () => {
              await logout();
              router.replace('/login');
            }}
          />
        </View>
      </Card>
    </Screen>
  );
}
