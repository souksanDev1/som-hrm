'use client';
import { PERMISSIONS, type EmployeeDetail } from '@hrm/shared';
import { useParams, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { QueryState } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { EmployeeForm, type EmployeeFormValues } from '@/features/employees/components/EmployeeForm';
import { useEmployee, useUpdateEmployee } from '@/features/employees/hooks';
import { useT } from '@/lib/i18n';

/** Map the API detail onto form defaults (nulls → blank; masked secrets are not prefilled, so they stay unchanged). */
const toFormValues = (e: EmployeeDetail): Partial<EmployeeFormValues> => ({
  employeeCode: e.employeeCode,
  firstName: e.firstName,
  lastName: e.lastName,
  firstNameEn: e.firstNameEn ?? undefined,
  lastNameEn: e.lastNameEn ?? undefined,
  nickname: e.nickname ?? undefined,
  gender: e.gender,
  dateOfBirth: e.dateOfBirth ?? undefined,
  phone: e.phone ?? undefined,
  email: e.email ?? undefined,
  address: e.address ?? undefined,
  village: e.village ?? undefined,
  district: e.district ?? undefined,
  province: (e.province ?? undefined) as EmployeeFormValues['province'],
  nationalityType: e.nationalityType,
  nationality: e.nationality ?? undefined,
  idCardNo: e.sensitiveMasked ? undefined : (e.idCardNo ?? undefined),
  socialSecurityNo: e.sensitiveMasked ? undefined : (e.socialSecurityNo ?? undefined),
  ssnRegisteredAt: e.ssnRegisteredAt ?? undefined,
  familyBookNo: e.sensitiveMasked ? undefined : (e.familyBookNo ?? undefined),
  familyBookHolder: e.familyBookHolder ?? undefined,
  hireDate: e.hireDate,
  contractType: e.contractType,
  contractEndDate: e.contractEndDate ?? undefined,
  probationEndDate: e.probationEndDate ?? undefined,
  payType: e.payType,
  status: e.status,
  hazardousWork: e.hazardousWork,
  branchId: e.branch?.id,
  departmentId: e.department?.id,
  positionId: e.position?.id,
  managerId: e.manager?.id,
  isTopLevel: e.isTopLevel,
});

function EditForm({ employee }: { employee: EmployeeDetail }) {
  const router = useRouter();
  const update = useUpdateEmployee(employee.id);
  const defaults = useMemo(() => toFormValues(employee), [employee]);
  return (
    <EmployeeForm
      mode="edit"
      defaultValues={defaults}
      currentManager={employee.manager}
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
