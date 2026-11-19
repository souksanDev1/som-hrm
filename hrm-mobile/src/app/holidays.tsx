import { Redirect, router } from 'expo-router';
import { Text } from 'react-native';
import { BackButton, Card, QueryView, Screen } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { useMyHolidays } from '@/features/holidays/api';
import { HolidayYearList } from '@/features/holidays/HolidayYearList';
import { useT } from '@/lib/i18n';

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "Holidays this year" (read-only), opened from the profile tab. */
export default function HolidaysScreen() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const today = localToday();
  const year = Number(today.slice(0, 4));
  const holidays = useMyHolidays(year);
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="holidays-screen">
      <BackButton onPress={() => router.back()} testID="holidays-back" />
      <Text className="mb-1 text-2xl font-semibold text-ink dark:text-night-ink">{`${t('holiday.thisYear')} ${year}`}</Text>
      <Text className="mb-4 text-sm text-ink-muted">{t('holiday.mineHint')}</Text>
      <QueryView query={holidays} isEmpty={(d) => d.length === 0}>
        {(data) => (
          <Card>
            <HolidayYearList holidays={data} today={today} />
          </Card>
        )}
      </QueryView>
    </Screen>
  );
}
