'use client';
import { interpolate, SCAN_ROW_STATUSES, type ScanImportPreview, type ScanImportPreviewRow } from '@hrm/shared';
import { useState } from 'react';
import { Badge, Button, type BadgeTone } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

type Status = ScanImportPreviewRow['status'];
type Filter = Status | 'ALL';

export const SCAN_STATUS_TONE: Record<Status, BadgeTone> = { OK: 'success', UNMATCHED: 'warning', DUPLICATE: 'neutral', INVALID: 'danger' };

const th = 'py-2 pr-3 font-medium whitespace-nowrap';
const td = 'py-2 pr-3';

export interface ScanPreviewTableProps {
  preview: Pick<ScanImportPreview, 'rows' | 'counts' | 'totalRows'>;
}

/** Preview of a scanner file (FR-ATT-02.4/02.5): counts per status as filters, then the rows with their reason. */
export function ScanPreviewTable({ preview }: ScanPreviewTableProps) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>('ALL');
  const rows = filter === 'ALL' ? preview.rows : preview.rows.filter((r) => r.status === filter);
  const filters: { key: Filter; count: number }[] = [
    { key: 'ALL', count: preview.totalRows },
    ...SCAN_ROW_STATUSES.map((s) => ({ key: s, count: preview.counts[s] })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('scan.filter')} data-testid="scan-filters">
        {filters.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'primary' : 'secondary'}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            data-testid={`scan-filter-${f.key}`}
          >
            {t(f.key === 'ALL' ? 'scan.filter.ALL' : `scan.status.${f.key}`)}
            <span className="tabular-nums" data-testid={`scan-count-${f.key}`}>
              {f.count}
            </span>
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t('common.empty')}</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-left text-sm" data-testid="scan-preview">
            <thead className="sticky top-0 border-b border-line bg-white text-xs uppercase text-ink-muted dark:border-night-line dark:bg-night-surface">
              <tr>
                <th className={th}>{t('scan.col.row')}</th>
                <th className={th}>{t('scan.col.employee')}</th>
                <th className={th}>{t('scan.col.time')}</th>
                <th className={th}>{t('scan.col.kind')}</th>
                <th className={th}>{t('scan.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rowNumber} className="border-b border-line align-top last:border-0 dark:border-night-line" data-testid="scan-row" data-status={r.status}>
                  <td className={cn(td, 'tabular-nums text-ink-muted')}>{r.rowNumber}</td>
                  <td className={td}>
                    <span className="font-medium">{r.employeeCode ?? '—'}</span>
                    {r.employeeName ? <span className="block text-xs text-ink-muted">{r.employeeName}</span> : null}
                  </td>
                  <td className={cn(td, 'whitespace-nowrap tabular-nums')}>
                    {r.localDateTime ?? '—'}
                    {r.workDate && r.localDateTime && !r.localDateTime.startsWith(r.workDate) ? (
                      <span className="block text-xs text-ink-muted">{interpolate(t('scan.workDate'), { date: r.workDate })}</span>
                    ) : null}
                  </td>
                  <td className={td}>
                    {r.kind ? t(`scan.kind.${r.kind}`) : '—'}
                    {r.kindInferred ? <span className="block text-xs text-ink-muted">{t('scan.kindInferred')}</span> : null}
                  </td>
                  <td className={td}>
                    <Badge tone={SCAN_STATUS_TONE[r.status]}>{t(`scan.status.${r.status}`)}</Badge>
                    {r.error ? (
                      <span className="mt-1 block text-xs text-ink-muted" data-testid="scan-row-reason">
                        {r.duplicateOfRow !== null ? interpolate(t(r.error), { row: r.duplicateOfRow }) : t(r.error)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
