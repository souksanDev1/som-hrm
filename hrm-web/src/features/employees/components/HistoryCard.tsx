'use client';
import type { EmploymentHistoryEntry } from '@hrm/shared';
import { useState } from 'react';
import { Card, Pagination, QueryState, StateView } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useEmployeeHistory } from '../hooks';

const PAGE_SIZE = 10;

/**
 * Field changes of one history entry, e.g. "Status: Probation → Active". Ids are shown with the names the
 * API resolved (`labels`); `employmentType` only appears in entries written before the M3 split.
 */
function Changes({ entry }: { entry: EmploymentHistoryEntry }) {
  const t = useT();
  const keys = Object.keys(entry.toValue ?? {});
  const show = (k: string, v: unknown) => {
    if (v === null || v === undefined) return '—';
    if (k === 'status') return t(`status.${String(v)}`);
    if (k === 'employmentType') return t(`employmentType.${String(v)}`);
    if (k === 'contractType') return t(`empx.contractType.${String(v)}`);
    if (k === 'payType') return t(`empx.payType.${String(v)}`);
    return entry.labels[String(v)] ?? String(v);
  };
  return (
    <ul className="text-xs text-ink-muted">
      {keys.map((k) => (
        <li key={k}>
          {t(`empx.history.field.${k}`)}: {entry.fromValue ? `${show(k, entry.fromValue[k])} → ` : ''}
          {show(k, entry.toValue?.[k])}
        </li>
      ))}
    </ul>
  );
}

/** Employment history (FR-EMP-08), newest first. */
export function HistoryCard({ employeeId }: { employeeId: string }) {
  const t = useT();
  const [page, setPage] = useState(1);
  const query = useEmployeeHistory(employeeId, page, PAGE_SIZE);
  return (
    <Card title={t('empx.history.title')} data-testid="history-card">
      <QueryState query={query}>
        {(data) =>
          data.items.length === 0 ? (
            <StateView kind="empty" title={t('common.empty')} />
          ) : (
            <>
              <ol className="flex flex-col divide-y divide-line dark:divide-night-line">
                {data.items.map((h) => (
                  <li key={h.id} className="py-2" data-testid="history-row">
                    <p className="text-sm font-medium text-ink dark:text-night-ink">
                      <span className="tabular-nums">{h.effectiveDate}</span> · {t(`empx.history.change.${h.changeType}`)}
                    </p>
                    <Changes entry={h} />
                    {h.createdBy && (
                      <p className="text-xs text-ink-muted">
                        {t('empx.history.by')} {h.createdBy.name}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
              {data.total > PAGE_SIZE && (
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={data.total}
                  onChange={setPage}
                  labels={{ previous: t('common.previous'), next: t('common.next') }}
                />
              )}
            </>
          )
        }
      </QueryState>
    </Card>
  );
}
