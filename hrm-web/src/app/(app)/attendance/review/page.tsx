'use client';
import { PERMISSIONS } from '@hrm/shared';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Pagination, QueryState, StateView } from '@/components/ui';
import { ReviewQueueList } from '@/features/attendance-requests/components/ReviewQueueList';
import { useDecideReview, useReviewQueue } from '@/features/attendance-requests/hooks';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { useT } from '@/lib/i18n';

/** Suspicious punches waiting for HR (FR-ATT-14). */
export default function AttendanceReviewPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const query = useReviewQueue(page);
  const decide = useDecideReview();
  return (
    <RequirePermission permission={PERMISSIONS.ATTENDANCE_REVIEW}>
      <PageHeader title={t('attreq.review.title')} description={t('attreq.review.subtitle')} />
      <Card>
        <QueryState query={query}>
          {(data) =>
            data.items.length === 0 ? (
              <StateView kind="empty" title={t('attreq.review.empty')} />
            ) : (
              <>
                <ReviewQueueList items={data.items} onDecide={(id, body) => decide.mutateAsync({ id, body })} />
                <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} labels={{ previous: t('common.previous'), next: t('common.next') }} />
              </>
            )
          }
        </QueryState>
      </Card>
    </RequirePermission>
  );
}
