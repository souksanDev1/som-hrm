'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Pagination, QueryState } from '@/components/ui';
import { PlatformAuditList } from '@/features/platform/components/PlatformAuditList';
import { usePlatformAuditLogs } from '@/features/platform/hooks';
import { useT } from '@/lib/i18n';

export default function PlatformAuditPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const query = usePlatformAuditLogs(page);
  return (
    <>
      <PageHeader title={t('platform.nav.audit')} />
      <Card>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
          {(data) => (
            <>
              <PlatformAuditList items={data.items} />
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} labels={{ previous: t('common.previous'), next: t('common.next') }} />
            </>
          )}
        </QueryState>
      </Card>
    </>
  );
}
