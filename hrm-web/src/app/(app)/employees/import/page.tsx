'use client';
import { PERMISSIONS } from '@hrm/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { EmployeeImport } from '@/features/employees/components/EmployeeImport';
import { useT } from '@/lib/i18n';

export default function ImportEmployeesPage() {
  const t = useT();
  return (
    <RequirePermission permission={PERMISSIONS.EMPLOYEE_IMPORT}>
      <PageHeader title={t('empx.import.title')} description={t('empx.import.subtitle')} />
      <EmployeeImport />
    </RequirePermission>
  );
}
