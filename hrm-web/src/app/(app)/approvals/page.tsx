'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Pagination, QueryState, StateView } from '@/components/ui';
import { ApprovalInbox } from '@/features/approvals/components/ApprovalInbox';
import { useApprovalInbox } from '@/features/approvals/hooks';
import { useT } from '@/lib/i18n';

/** Requests waiting for the signed-in user as manager, delegate, upper level or HR (FR-ORG-02). */
export default function ApprovalsPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const query = useApprovalInbox(page);
  return (
    <>
      <PageHeader title={t('approval.title')} description={t('approval.subtitle')} />
      <Card>
        <QueryState query={query}>
          {(data) =>
            data.items.length === 0 ? (
              <StateView kind="empty" title={t('approval.inbox.empty')} />
            ) : (
              <>
                <ApprovalInbox items={data.items} />
                <Pagination
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.total}
                  onChange={setPage}
                  labels={{ previous: t('common.previous'), next: t('common.next') }}
                />
              </>
            )
          }
        </QueryState>
      </Card>
    </>
  );
}
