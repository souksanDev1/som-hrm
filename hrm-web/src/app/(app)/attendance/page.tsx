'use client';
import { addDays, ATTENDANCE_DAY_STATUSES, PERMISSIONS, type AttendanceStatus } from '@hrm/shared';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, Field, Input, QueryState, Select } from '@/components/ui';
import { useAuthStore, useHasPermission } from '@/features/auth/store';
import { useDepartments } from '@/features/org/hooks';
import { AttendanceDayTable } from '@/features/shifts/components/AttendanceDayTable';
import { STATUS_TONE, todayLocal } from '@/features/shifts/format';
import { useAttendanceDays } from '@/features/shifts/hooks';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

const CHIP_TONE: Record<string, string> = {
  success: 'border-success/30 text-success',
  warning: 'border-warning/30 text-warning',
  danger: 'border-danger/30 text-danger',
  primary: 'border-primary/30 text-primary',
  neutral: 'border-line text-ink-muted',
};

/**
 * Daily attendance (FR-ATT-18): one date, everyone in the caller's attendance scope (HR: workspace; manager:
 * reporting tree; others: themselves), with status chips that count and filter.
 */
export default function AttendanceDailyPage() {
  const t = useT();
  const [date, setDate] = useState(todayLocal);
  const [status, setStatus] = useState<AttendanceStatus | ''>('');
  const [departmentId, setDepartmentId] = useState('');
  const canReadAll = useHasPermission(PERMISSIONS.ATTENDANCE_READ_ALL);
  const canManageShifts = useHasPermission(PERMISSIONS.SHIFT_MANAGE);
  const ownEmployeeId = useAuthStore((s) => s.user?.employeeId ?? null);
  const departments = useDepartments();
  const query = useAttendanceDays({ from: date, to: date, departmentId: departmentId || undefined });

  return (
    <>
      <PageHeader
        title={t('attreport.title')}
        description={t('attreport.subtitle')}
        actions={
          <>
            {ownEmployeeId && (
              <Link href={`/attendance/employees/${ownEmployeeId}`}>
                <Button variant="secondary" icon="person">{t('attreport.myAttendance')}</Button>
              </Link>
            )}
            {(canManageShifts || canReadAll) && (
              <Link href="/attendance/roster">
                <Button variant="secondary" icon="calendar_view_week">{t('roster.title')}</Button>
              </Link>
            )}
            {canManageShifts && (
              <Link href="/settings/shifts">
                <Button variant="secondary" icon="schedule">{t('shifts.title')}</Button>
              </Link>
            )}
          </>
        }
      />
      <Card>
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Field label={t('attreport.date')} htmlFor="attendance-date">
            <span className="flex items-center gap-1">
              <Button size="sm" variant="ghost" icon="chevron_left" aria-label={t('common.previous')} onClick={() => setDate((d) => addDays(d, -1))} />
              <Input id="attendance-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              <Button size="sm" variant="ghost" icon="chevron_right" aria-label={t('common.next')} onClick={() => setDate((d) => addDays(d, 1))} />
            </span>
          </Field>
          <Field label={t('attreport.status')} htmlFor="attendance-status">
            <Select
              id="attendance-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as AttendanceStatus | '')}
              placeholder={t('attreport.allStatuses')}
              options={ATTENDANCE_DAY_STATUSES.map((s) => ({ value: s, label: t(`attendance.status.${s}`) }))}
            />
          </Field>
          {canReadAll && (
            <Field label={t('roster.department')} htmlFor="attendance-department">
              <Select
                id="attendance-department"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                placeholder={t('roster.allDepartments')}
                options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
              />
            </Field>
          )}
        </div>
        <QueryState query={query}>
          {({ items }) => {
            const counts = new Map<AttendanceStatus, number>();
            for (const d of items) counts.set(d.status, (counts.get(d.status) ?? 0) + 1);
            const shown = status ? items.filter((d) => d.status === status) : items;
            return (
              <>
                <div className="mb-3 flex flex-wrap gap-2" data-testid="attendance-chips">
                  {ATTENDANCE_DAY_STATUSES.filter((s) => counts.has(s)).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={status === s}
                      data-testid={`attendance-chip-${s}`}
                      onClick={() => setStatus((cur) => (cur === s ? '' : s))}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium',
                        CHIP_TONE[STATUS_TONE[s]],
                        status === s && 'bg-primary-soft ring-1 ring-primary',
                      )}
                    >
                      {`${t(`attendance.status.${s}`)} ${counts.get(s)}`}
                    </button>
                  ))}
                </div>
                <AttendanceDayTable days={shown} rowLabel="employee" />
              </>
            );
          }}
        </QueryState>
      </Card>
    </>
  );
}
