'use client';
import { PERMISSIONS } from '@hrm/shared';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, QueryState } from '@/components/ui';
import { useDelegateCandidates } from '@/features/approvals/hooks';
import { useHasPermission } from '@/features/auth/store';
import { leaveRequestsApi } from '@/features/leave-requests/api';
import { LeaveRequestForm } from '@/features/leave-requests/components/LeaveRequestForm';
import { useCreateLeaveRequest, useLeaveTypes } from '@/features/leave-requests/hooks';
import { useT } from '@/lib/i18n';

/** New leave request with the live API preview (FR-LV-03/05/06), proxy filing (FR-LV-10) and delegate (FR-ORG-03.2). */
export default function NewLeavePage() {
  const t = useT();
  const router = useRouter();
  const types = useLeaveTypes();
  const create = useCreateLeaveRequest();
  // HR files for anyone; a manager (employee.read = has a reporting line) for their team. The API enforces the scope.
  const onBehalf = useHasPermission(PERMISSIONS.LEAVE_FILE_ON_BEHALF);
  const manager = useHasPermission(PERMISSIONS.EMPLOYEE_READ);
  const candidates = useDelegateCandidates(true);

  return (
    <>
      <PageHeader title={t('lvr.form.title')} description={t('lvr.form.subtitle')} />
      <Card>
        <QueryState query={types}>
          {(list) => (
            <LeaveRequestForm
              types={list}
              canFileForOthers={onBehalf || manager}
              delegateOptions={(candidates.data ?? []).map((c) => ({ value: c.userId, label: c.employeeCode ? `${c.employeeCode} · ${c.name}` : c.name }))}
              onPreview={leaveRequestsApi.preview}
              onUpload={leaveRequestsApi.uploadCertificate}
              onSubmit={async (input) => {
                await create.mutateAsync(input);
                router.push('/leave?submitted=1');
              }}
              onCancel={() => router.push('/leave')}
            />
          )}
        </QueryState>
      </Card>
    </>
  );
}
