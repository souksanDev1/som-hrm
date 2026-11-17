'use client';
import type { AttendanceDayView } from '@hrm/shared';
import Link from 'next/link';
import { StateView } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { formatHoursFromMinutes, formatMinutes } from '../format';
import { AttendanceStatusBadge } from './AttendanceStatusBadge';
import { ShiftSwatch } from './ShiftSwatch';

export interface AttendanceDayTableProps {
  days: readonly AttendanceDayView[];
  /** First column: the employee (daily view, links to their month) or the date (one employee's month). */
  rowLabel: 'employee' | 'date';
}

/** Computed attendance days (FR-ATT-18): shift, in/out (workspace-local, from the API), late, early, worked, status. */
export function AttendanceDayTable({ days, rowLabel }: AttendanceDayTableProps) {
  const t = useT();
  if (days.length === 0) return <StateView kind="empty" title={t('attreport.empty')} />;
  const th = 'py-2 pr-3 font-medium';
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[640px] text-left text-sm" data-testid="attendance-day-table">
        <thead className="border-b border-line text-xs uppercase text-ink-muted dark:border-night-line">
          <tr>
            <th className={th}>{t(rowLabel === 'employee' ? 'attreport.employee' : 'attreport.date')}</th>
            <th className={th}>{t('attreport.shift')}</th>
            <th className={th}>{t('attreport.in')}</th>
            <th className={th}>{t('attreport.out')}</th>
            <th className={th}>{t('attreport.late')}</th>
            <th className={th}>{t('attreport.early')}</th>
            <th className={th}>{t('attreport.worked')}</th>
            <th className="py-2 font-medium">{t('attreport.status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line dark:divide-night-line">
          {days.map((d) => (
            <tr key={d.id} data-testid="attendance-day-row" data-status={d.status}>
              <td className="py-2 pr-3">
                {rowLabel === 'employee' ? (
                  <Link href={`/attendance/employees/${d.employeeId}`} className="font-medium text-primary hover:underline">
                    {d.employeeName}
                    <span className="block text-xs font-normal text-ink-muted">{[d.employeeCode, d.departmentName].filter(Boolean).join(' · ')}</span>
                  </Link>
                ) : (
                  <span className="tabular-nums">{d.workDate}</span>
                )}
              </td>
              <td className="py-2 pr-3">
                {d.shiftName ? (
                  <span className="flex items-center gap-2">
                    <ShiftSwatch shift={{ name: d.shiftName, code: d.shiftCode, color: d.shiftColor }} />
                    <span className="hidden text-xs text-ink-muted md:inline">{`${d.scheduledStartLocal ?? ''}–${d.scheduledEndLocal ?? ''}`}</span>
                  </span>
                ) : (
                  t('attreport.noShift')
                )}
              </td>
              <td className="py-2 pr-3 tabular-nums">{d.firstInLocal ?? '—'}</td>
              <td className="py-2 pr-3 tabular-nums">{d.lastOutLocal ?? '—'}</td>
              <td className="py-2 pr-3 tabular-nums">{formatMinutes(t, d.lateMinutes)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatMinutes(t, d.earlyLeaveMinutes)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatHoursFromMinutes(t, d.workedMinutes)}</td>
              <td className="py-2">
                <AttendanceStatusBadge status={d.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
