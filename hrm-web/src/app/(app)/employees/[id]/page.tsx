'use client';
import { PERMISSIONS } from '@hrm/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, QueryState } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { useHasPermission } from '@/features/auth/store';
import { EmployeeProfile } from '@/features/employees/components/EmployeeProfile';
import { useEmployee } from '@/features/employees/hooks';
import { useT } from '@/lib/i18n';

export default function EmployeeDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const query = useEmployee(id);
  const canWrite = useHasPermission(PERMISSIONS.EMPLOYEE_WRITE);
  return (
    <RequirePermission permission={PERMISSIONS.EMPLOYEE_READ}>
      <QueryState query={query}>
        {(e) => (
          <>
            <PageHeader
              title={`${e.firstName} ${e.lastName}`}
              description={[e.employeeCode, e.position?.name].filter(Boolean).join(' · ')}
              actions={
                <>
                  <Link href="/employees"><Button variant="secondary" icon="arrow_back">{t('common.back')}</Button></Link>
                  {canWrite && <Link href={`/employees/${e.id}/edit`}><Button icon="edit">{t('common.edit')}</Button></Link>}
                </>
              }
            />
            <EmployeeProfile employee={e} />
          </>
        )}
      </QueryState>
    </RequirePermission>
  );
}
