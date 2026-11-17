'use client';
import { PERMISSIONS } from '@hrm/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui';
import { OnBehalfForm } from '@/features/attendance-requests/components/OnBehalfForm';
import { usePunchOnBehalf } from '@/features/attendance-requests/hooks';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { useT } from '@/lib/i18n';

/** HR records a punch for an employee (FR-ATT-04). */
export default function OnBehalfPunchPage() {
  const t = useT();
  const punch = usePunchOnBehalf();
  return (
    <RequirePermission permission={PERMISSIONS.ATTENDANCE_PUNCH_ON_BEHALF}>
      <PageHeader title={t('attreq.onBehalf.title')} description={t('attreq.onBehalf.subtitle')} />
      <Card className="max-w-2xl">
        <OnBehalfForm onSubmit={(input) => punch.mutateAsync(input)} />
      </Card>
    </RequirePermission>
  );
}
