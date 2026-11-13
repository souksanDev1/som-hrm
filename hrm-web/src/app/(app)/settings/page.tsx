'use client';
import { PERMISSIONS } from '@hrm/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { useHasPermission } from '@/features/auth/store';
import { orgApi } from '@/features/org/api';
import { OrgEntityList } from '@/features/org/components/OrgEntityList';
import { orgKeys, useBranches, useDepartments, useOrgMutation, usePositions } from '@/features/org/hooks';
import { useT } from '@/lib/i18n';

export default function SettingsPage() {
  const t = useT();
  const canEdit = useHasPermission(PERMISSIONS.ORG_WRITE);
  const branches = useBranches();
  const departments = useDepartments();
  const positions = usePositions();
  const createBranch = useOrgMutation(orgKeys.branches, (name: string) => orgApi.createBranch({ name }));
  const deleteBranch = useOrgMutation(orgKeys.branches, orgApi.deleteBranch);
  const createDept = useOrgMutation(orgKeys.departments, (name: string) => orgApi.createDepartment({ name }));
  const deleteDept = useOrgMutation(orgKeys.departments, orgApi.deleteDepartment);
  const createPos = useOrgMutation(orgKeys.positions, (name: string) => orgApi.createPosition({ name }));
  const deletePos = useOrgMutation(orgKeys.positions, orgApi.deletePosition);

  return (
    <RequirePermission permission={PERMISSIONS.ORG_READ}>
      <PageHeader title={t('nav.settings')} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <OrgEntityList
          title={t('org.branches')}
          testId="branches"
          canEdit={canEdit}
          items={(branches.data ?? []).map((b) => ({ id: b.id, name: b.name, meta: `${b.employeeCount}` }))}
          creating={createBranch.isPending}
          error={createBranch.error ?? deleteBranch.error}
          onCreate={(n) => createBranch.mutateAsync(n)}
          onDelete={(id) => deleteBranch.mutate(id)}
        />
        <OrgEntityList
          title={t('org.departments')}
          testId="departments"
          canEdit={canEdit}
          items={(departments.data ?? []).map((d) => ({ id: d.id, name: d.name, meta: `${d.employeeCount}` }))}
          creating={createDept.isPending}
          error={createDept.error ?? deleteDept.error}
          onCreate={(n) => createDept.mutateAsync(n)}
          onDelete={(id) => deleteDept.mutate(id)}
        />
        <OrgEntityList
          title={t('org.positions')}
          testId="positions"
          canEdit={canEdit}
          items={(positions.data ?? []).map((p) => ({ id: p.id, name: p.name }))}
          creating={createPos.isPending}
          error={createPos.error ?? deletePos.error}
          onCreate={(n) => createPos.mutateAsync(n)}
          onDelete={(id) => deletePos.mutate(id)}
        />
      </div>
    </RequirePermission>
  );
}
