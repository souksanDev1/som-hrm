import { laoProvinceName } from '@hrm/shared';
import { Text, View } from 'react-native';
import { Card, EmployeeHeader, InfoRow, QueryView, Screen } from '@/components/ui';
import { useMyProfile } from '@/features/profile/api';
import { ExpiryBadge } from '@/features/profile/ExpiryBadge';
import { usePrefsStore, useT } from '@/lib/i18n';

/** Read-only personal information, opened from the profile tab. */
export default function PersonalInfoScreen() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const profile = useMyProfile();

  return (
    <Screen testID="personal-screen" header={<EmployeeHeader title={t('authx.account.personal')} back testID="personal" />}>
      <QueryView query={profile}>
        {(e) => (
          <>
            <Card>
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
              <View className="mt-4">
                <Card>
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
                </Card>
              </View>
            )}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
