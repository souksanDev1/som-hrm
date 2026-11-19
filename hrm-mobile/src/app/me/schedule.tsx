import { EmployeeHeader, Screen } from '@/components/ui';
import { MyWorkScheduleCard } from '@/features/schedule/MyWorkScheduleCard';
import { useT } from '@/lib/i18n';

/** "My work schedule", opened from the profile tab. */
export default function MyScheduleScreen() {
  const t = useT();
  return (
    <Screen testID="my-schedule-screen" header={<EmployeeHeader title={t('schedule.mine')} back testID="my-schedule" />}>
      <MyWorkScheduleCard />
    </Screen>
  );
}
