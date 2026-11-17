'use client';
import { ATTENDANCE_DAY_STATUSES, type AttendanceSummary } from '@hrm/shared';
import { Card } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { formatHoursFromMinutes, formatMinutes } from '../format';
import { AttendanceStatusBadge } from './AttendanceStatusBadge';

/** Month totals from `/attendance/days/summary`: days per status and minute totals. */
export function AttendanceSummaryCard({ summary, className }: { summary: AttendanceSummary; className?: string }) {
  const t = useT();
  const stat = (label: string, value: string | number, testId: string) => (
    <div className="rounded-md border border-line p-3 dark:border-night-line">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-ink dark:text-night-ink" data-testid={testId}>{value}</div>
    </div>
  );
  return (
    <Card title={t('attreport.summary')} className={className} data-testid="attendance-summary">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat(t('attreport.days'), summary.days, 'summary-days')}
        {stat(t('attreport.totalLate'), formatMinutes(t, summary.lateMinutes), 'summary-late')}
        {stat(t('attreport.totalEarly'), formatMinutes(t, summary.earlyLeaveMinutes), 'summary-early')}
        {stat(t('attreport.totalWorked'), formatHoursFromMinutes(t, summary.workedMinutes), 'summary-worked')}
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {ATTENDANCE_DAY_STATUSES.filter((s) => (summary.counts[s] ?? 0) > 0).map((s) => (
          <li key={s} className="flex items-center gap-1 text-sm" data-testid={`summary-count-${s}`}>
            <AttendanceStatusBadge status={s} />
            <span className="tabular-nums">{summary.counts[s]}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
