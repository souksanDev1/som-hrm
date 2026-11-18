'use client';
import { PageHeader } from '@/components/layout/PageHeader';
import { LeaveCalendarScreen } from '@/features/leave-calendar/components/LeaveCalendarScreen';
import { useT } from '@/lib/i18n';

/** Leave calendar (FR-LV-13): every signed-in user; the API decides who and what each viewer sees. */
export default function LeaveCalendarPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('lcal.title')} description={t('lcal.subtitle')} />
      <LeaveCalendarScreen />
    </>
  );
}
