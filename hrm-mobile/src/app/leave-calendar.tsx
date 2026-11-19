import { Redirect } from 'expo-router';
import { EmployeeHeader, Screen } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { LeaveCalendarPanel } from '@/features/leave-calendar/LeaveCalendarPanel';
import { useT } from '@/lib/i18n';

/** Who is off this month; today and week remain available from the standalone calendar. */
export default function LeaveCalendarScreen() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="leave-calendar-screen" header={<EmployeeHeader title={t('lcal.title')} back testID="lcal" />}>
      <LeaveCalendarPanel showViewSwitcher />
    </Screen>
  );
}
