'use client';
import { useState } from 'react';
import { Badge, Card, Pagination, QueryState } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useScanImportHistory } from '../hooks';

const PAGE_SIZE = 10;
const th = 'py-2 pr-3 font-medium whitespace-nowrap';
const td = 'py-2 pr-3';

/** Past scanner imports of the workspace (FR-ATT-02), newest first. */
export function ScanImportHistory() {
  const t = useT();
  const [page, setPage] = useState(1);
  const query = useScanImportHistory(page, PAGE_SIZE);

  return (
    <Card title={t('scan.history')}>
      <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
        {(data) => (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="scan-history">
                <thead className="border-b border-line text-xs uppercase text-ink-muted dark:border-night-line">
                  <tr>
                    <th className={th}>{t('scan.history.date')}</th>
                    <th className={th}>{t('scan.history.file')}</th>
                    <th className={th}>{t('scan.format')}</th>
                    <th className={th}>{t('scan.branch')}</th>
                    <th className={th}>{t('scan.history.imported')}</th>
                    <th className={th}>{t('scan.history.skipped')}</th>
                    <th className={th}>{t('scan.history.by')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i.id} className="border-b border-line last:border-0 dark:border-night-line" data-testid="scan-history-row">
                      <td className={`${td} whitespace-nowrap tabular-nums`}>{new Date(i.createdAt).toLocaleString()}</td>
                      <td className={`${td} max-w-[16rem] truncate`} title={i.fileName}>
                        {i.fileName}
                      </td>
                      <td className={td}>{t(`scan.format.${i.format}`)}</td>
                      <td className={td}>{i.branchName ?? t('scan.allBranches')}</td>
                      <td className={td}>
                        <Badge tone="success">{i.importedRows}</Badge>
                      </td>
                      <td className={td}>{i.errorRows ? <Badge tone="warning">{i.errorRows}</Badge> : '0'}</td>
                      <td className={td}>{i.uploadedByName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onChange={setPage}
              labels={{ previous: t('common.previous'), next: t('common.next') }}
            />
          </>
        )}
      </QueryState>
    </Card>
  );
}
