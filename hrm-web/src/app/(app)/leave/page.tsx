'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, QueryState } from '@/components/ui';
import { LeaveBalanceList, LeaveRequestList } from '@/features/leave-requests/components/LeaveViews';
import { useLeaveRequests, useLeaveTypes, useMyLeaveBalances } from '@/features/leave-requests/hooks';
import { useT } from '@/lib/i18n';

/** My leave (FR-LV-06.2, FR-LV-09): yearly balances from the ledger and every own request. */
function MyLeaveView() {
  const t = useT();
  const params = useSearchParams();
  const balances = useMyLeaveBalances();
  const types = useLeaveTypes();
  const requests = useLeaveRequests({ scope: 'mine' });

  return (
    <>
      <PageHeader
        title={t('lvr.mine.title')}
        description={t('lvr.mine.subtitle')}
        actions={
          <Link href="/leave/new">
            <Button icon="event_available" data-testid="leave-new">
              {t('lvr.new')}
            </Button>
          </Link>
        }
      />
      {params.get('submitted') === '1' && (
        <p className="mb-4 rounded-sm bg-success-soft px-3 py-2 text-sm text-success" data-testid="leave-submitted">
          {t('lvr.submitted')}
        </p>
      )}
      <div className="flex flex-col gap-4">
        <Card>
          <QueryState query={balances}>
            {(data) => <LeaveBalanceList year={data.year} balances={data.balances} types={types.data ?? []} />}
          </QueryState>
        </Card>
        <Card title={t('lvr.requests.title')}>
          <QueryState query={requests}>{(items) => <LeaveRequestList items={items} />}</QueryState>
        </Card>
      </div>
    </>
  );
}

export default function MyLeavePage() {
  return (
    <Suspense>
      <MyLeaveView />
    </Suspense>
  );
}
