'use client';
import { PERMISSIONS } from '@hrm/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { orgApi } from '@/features/org/api';
import { OrgEntityList } from '@/features/org/components/OrgEntityList';
import { orgKeys, useBranches, useDepartments, useOrgMutation, usePositions } from '@/features/org/hooks';
import { useT } from '@/lib/i18n';

type Rename = { id: string; name: string };

/** Organisation settings: branches, departments and positions (add, rename, delete). Same permission as the nav entry. */
export default function SettingsPage() {
  const t = useT();
  const branches = useBranches();
  const departments = useDepartments();
  const positions = usePositions();
  const createBranch = useOrgMutation(orgKeys.branches, (name: string) => orgApi.createBranch({ name }));
  const renameBranch = useOrgMutation(orgKeys.branches, (r: Rename) => orgApi.updateBranch(r.id, { name: r.name }));
  const deleteBranch = useOrgMutation(orgKeys.branches, orgApi.deleteBranch);
  const createDept = useOrgMutation(orgKeys.departments, (name: string) => orgApi.createDepartment({ name }));
  const renameDept = useOrgMutation(orgKeys.departments, (r: Rename) => orgApi.updateDepartment(r.id, { name: r.name }));
  const deleteDept = useOrgMutation(orgKeys.departments, orgApi.deleteDepartment);
  const createPos = useOrgMutation(orgKeys.positions, (name: string) => orgApi.createPosition({ name }));
  const renamePos = useOrgMutation(orgKeys.positions, (r: Rename) => orgApi.updatePosition(r.id, { name: r.name }));
  const deletePos = useOrgMutation(orgKeys.positions, orgApi.deletePosition);

  return (
    <RequirePermission permission={PERMISSIONS.ORG_WRITE}>
      <PageHeader title={t('nav.settings')} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <OrgEntityList
          title={t('org.branches')}
          testId="branches"
          canEdit
          items={(branches.data ?? []).map((b) => ({ id: b.id, name: b.name, meta: `${b.employeeCount}` }))}
          creating={createBranch.isPending}
          saving={renameBranch.isPending || deleteBranch.isPending}
          error={createBranch.error ?? renameBranch.error ?? deleteBranch.error}
          onCreate={(n) => createBranch.mutateAsync(n)}
          onRename={(id, name) => renameBranch.mutateAsync({ id, name })}
          onDelete={(id) => deleteBranch.mutateAsync(id)}
        />
        <OrgEntityList
          title={t('org.departments')}
          testId="departments"
          canEdit
          items={(departments.data ?? []).map((d) => ({ id: d.id, name: d.name, meta: `${d.employeeCount}` }))}
          creating={createDept.isPending}
          saving={renameDept.isPending || deleteDept.isPending}
          error={createDept.error ?? renameDept.error ?? deleteDept.error}
          onCreate={(n) => createDept.mutateAsync(n)}
          onRename={(id, name) => renameDept.mutateAsync({ id, name })}
          onDelete={(id) => deleteDept.mutateAsync(id)}
        />
        <OrgEntityList
          title={t('org.positions')}
          testId="positions"
          canEdit
          items={(positions.data ?? []).map((p) => ({ id: p.id, name: p.name }))}
          creating={createPos.isPending}
          saving={renamePos.isPending || deletePos.isPending}
          error={createPos.error ?? renamePos.error ?? deletePos.error}
          onCreate={(n) => createPos.mutateAsync(n)}
          onRename={(id, name) => renamePos.mutateAsync({ id, name })}
          onDelete={(id) => deletePos.mutateAsync(id)}
        />
      </div>
    </RequirePermission>
  );
}
