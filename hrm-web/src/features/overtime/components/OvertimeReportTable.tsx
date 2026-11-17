'use client';
import { formatDurationMinutes, OVERTIME_CATEGORIES, overtimeCategoryKey, type OvertimeReport } from '@hrm/shared';
import { useT } from '@/lib/i18n';

/** Approved OT of a month per employee and category, with a totals row — payroll input (FR-ATT-21). */
export function OvertimeReportTable({ report }: { report: OvertimeReport }) {
  const t = useT();
  const cell = 'px-3 py-2 text-right tabular-nums';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm" data-testid="ot-report-table">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted dark:border-night-line">
            <th className="px-3 py-2 text-left font-medium">{t('otx.report.employee')}</th>
            {OVERTIME_CATEGORIES.map((c) => (
              <th key={c} className="px-3 py-2 text-right font-medium">
                {t(overtimeCategoryKey(c))}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">{t('otx.total')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('otx.report.requests')}</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.employeeId} className="border-b border-line dark:border-night-line" data-testid="ot-report-row">
              <td className="px-3 py-2 text-ink dark:text-night-ink">{`${r.employeeCode} ${r.employeeName}`}</td>
              {OVERTIME_CATEGORIES.map((c) => (
                <td key={c} className={cell}>
                  {formatDurationMinutes(r[c])}
                </td>
              ))}
              <td className={`${cell} font-semibold`}>{formatDurationMinutes(r.totalMinutes)}</td>
              <td className={cell}>{r.requests}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-ink dark:text-night-ink" data-testid="ot-report-totals">
            <td className="px-3 py-2">{t('otx.report.totals')}</td>
            {OVERTIME_CATEGORIES.map((c) => (
              <td key={c} className={cell}>
                {formatDurationMinutes(report.totals[c])}
              </td>
            ))}
            <td className={cell}>{formatDurationMinutes(report.totals.totalMinutes)}</td>
            <td className={cell} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
