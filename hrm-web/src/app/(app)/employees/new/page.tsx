'use client';
import { PERMISSIONS } from '@hrm/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { EmployeeForm } from '@/features/employees/components/EmployeeForm';
import { useCreateEmployee } from '@/features/employees/hooks';
import { useT } from '@/lib/i18n';

export default function NewEmployeePage() {
  const t = useT();
  const router = useRouter();
  const create = useCreateEmployee();
  const [issued, setIssued] = useState<{ id: string; secret: string } | null>(null);

  return (
    <RequirePermission permission={PERMISSIONS.EMPLOYEE_WRITE}>
      <PageHeader title={t('employee.add')} />
      <EmployeeForm
        mode="create"
        submitting={create.isPending}
        error={create.error}
        onCancel={() => router.back()}
        onSubmit={(values) =>
          create.mutate(values, {
            onSuccess: (res) =>
              res.credential
                ? setIssued({ id: res.employee.id, secret: res.credential.temporarySecret })
                : router.push(`/employees/${res.employee.id}`),
          })
        }
      />
      <Modal
        open={!!issued}
        title={t('employee.temporarySecret')}
        onClose={() => issued && router.push(`/employees/${issued.id}`)}
        footer={<Button onClick={() => issued && router.push(`/employees/${issued.id}`)}>OK</Button>}
      >
        <p className="text-center text-3xl font-semibold tracking-[0.3em] tabular-nums" data-testid="temporary-secret">{issued?.secret}</p>
      </Modal>
    </RequirePermission>
  );
}
