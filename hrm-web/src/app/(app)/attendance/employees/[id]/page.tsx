'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, Field, Input, QueryState } from '@/components/ui';
import { AttendanceDayTable } from '@/features/shifts/components/AttendanceDayTable';
import { AttendanceSummaryCard } from '@/features/shifts/components/AttendanceSummaryCard';
import { monthBounds, todayLocal } from '@/features/shifts/format';
import { useAttendanceDays, useAttendanceSummary } from '@/features/shifts/hooks';
import { useT } from '@/lib/i18n';

/**
 * One employee's month (FR-ATT-18): summary + every computed day. The API enforces the scope (own days, a
 * manager's tree, HR's workspace) and answers 404 outside it.
 */
export default function EmployeeAttendancePage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const [month, setMonth] = useState(() => todayLocal().slice(0, 7));
  const range = monthBounds(month);
  const days = useAttendanceDays({ ...range, employeeId: id });
  const summary = useAttendanceSummary({ month, employeeId: id });
  const name = days.data?.items[0] ? `${days.data.items[0].employeeName} · ${days.data.items[0].employeeCode}` : undefined;

  return (
    <>
      <PageHeader
        title={t('attreport.employeeTitle')}
        description={name}
        actions={
          <Link href="/attendance">
            <Button variant="secondary" icon="arrow_back">{t('common.back')}</Button>
          </Link>
        }
      />
      <div className="mb-4 max-w-xs">
        <Field label={t('attreport.month')} htmlFor="attendance-month">
          <Input id="attendance-month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </Field>
      </div>
      <QueryState query={summary}>{(s) => <AttendanceSummaryCard summary={s} className="mb-4" />}</QueryState>
      <Card>
        <QueryState query={days}>{({ items }) => <AttendanceDayTable days={items} rowLabel="date" />}</QueryState>
      </Card>
    </>
  );
}
