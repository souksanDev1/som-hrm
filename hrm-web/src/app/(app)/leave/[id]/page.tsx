'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, QueryState } from '@/components/ui';
import { leaveRequestsApi } from '@/features/leave-requests/api';
import { LeaveRequestDetail } from '@/features/leave-requests/components/LeaveRequestDetail';
import { useAttachCertificate, useCancelLeaveRequest, useLeaveRequest } from '@/features/leave-requests/hooks';
import { useT } from '@/lib/i18n';

/** One leave request: status, certificate attach (FR-LV-05.3) and cancellation (FR-LV-12). */
export default function LeaveDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const query = useLeaveRequest(id);
  const attach = useAttachCertificate(id);
  const cancel = useCancelLeaveRequest(id);
  return (
    <>
      <PageHeader
        title={t('lvr.detail.title')}
        actions={
          <Link href="/leave">
            <Button variant="secondary" icon="arrow_back">
              {t('common.back')}
            </Button>
          </Link>
        }
      />
      <Card>
        <QueryState query={query}>
          {(r) => (
            <LeaveRequestDetail
              request={r}
              onAttach={async (file) => attach.mutateAsync((await leaveRequestsApi.uploadCertificate(file)).id)}
              onCancel={(reason) => cancel.mutateAsync(reason ? { reason } : {})}
              onDownloadCertificate={(fileId) => void leaveRequestsApi.downloadCertificate(fileId)}
            />
          )}
        </QueryState>
      </Card>
    </>
  );
}
