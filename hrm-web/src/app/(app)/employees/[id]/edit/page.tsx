'use client';
import { PERMISSIONS, type EmployeeDetail } from '@hrm/shared';
import { useParams, useRouter } from 'next/navigation';
import { QueryState } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { EmployeeForm, type EmployeeFormValues } from '@/features/employees/components/EmployeeForm';
import { useEmployee, useUpdateEmployee } from '@/features/employees/hooks';
import { useT } from '@/lib/i18n';

/** Map the API detail onto form defaults (nulls → undefined; masked secrets are not prefilled). */
const toFormValues = (e: EmployeeDetail): Partial<EmployeeFormValues> => ({
  employeeCode: e.employeeCode,
  firstName: e.firstName,
  lastName: e.lastName,
  nickname: e.nickname ?? undefined,
  gender: e.gender,
  dateOfBirth: e.dateOfBirth ?? undefined,
  phone: e.phone ?? undefined,
  email: e.email ?? undefined,
  address: e.address ?? undefined,
  nationalityType: e.nationalityType,
  nationality: e.nationality ?? undefined,
  idCardNo: e.sensitiveMasked ? undefined : (e.idCardNo ?? undefined),
  socialSecurityNo: e.sensitiveMasked ? undefined : (e.socialSecurityNo ?? undefined),
  familyBookNo: e.sensitiveMasked ? undefined : (e.familyBookNo ?? undefined),
  hireDate: e.hireDate,
  employmentType: e.employmentType,
  status: e.status,
  hazardousWork: e.hazardousWork,
  branchId: e.branch?.id,
  departmentId: e.department?.id,
  positionId: e.position?.id,
});

function EditForm({ employee }: { employee: EmployeeDetail }) {
  const router = useRouter();
  const update = useUpdateEmployee(employee.id);
  return (
    <EmployeeForm
      mode="edit"
      defaultValues={toFormValues(employee)}
      submitting={update.isPending}
      error={update.error}
      onCancel={() => router.back()}
      onSubmit={(values) => update.mutate(values, { onSuccess: () => router.push(`/employees/${employee.id}`) })}
    />
  );
}

export default function EditEmployeePage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const query = useEmployee(id);
  return (
    <RequirePermission permission={PERMISSIONS.EMPLOYEE_WRITE}>
      <PageHeader title={t('common.edit')} />
      <QueryState query={query}>{(e) => <EditForm employee={e} />}</QueryState>
    </RequirePermission>
  );
}
