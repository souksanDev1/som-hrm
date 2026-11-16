'use client';
import { GEOFENCE_RADIUS, PERMISSIONS, type Branch, type Department, type Position, type UpdateBranchInput, type UpdateDepartmentInput } from '@hrm/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Checkbox } from '@/components/ui';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { orgApi } from '@/features/org/api';
import { EntityFormDialog } from '@/features/org/components/EntityFormDialog';
import { OrgEntityList } from '@/features/org/components/OrgEntityList';
import {
  branchFormValues,
  departmentFormValues,
  parseBranchForm,
  parseDepartmentForm,
  parsePositionForm,
  positionFormValues,
} from '@/features/org/forms';
import { orgKeys, useBranches, useDepartments, useOrgMutation, usePositions } from '@/features/org/hooks';
import { useT } from '@/lib/i18n';

type Editing = { kind: 'branch'; item: Branch } | { kind: 'department'; item: Department } | { kind: 'position'; item: Position } | null;
type Toggle = { id: string; isActive: boolean };

/**
 * Organisation settings: branches (with GPS geofence), departments and positions — add, edit,
 * close/reopen and delete unused items (FR-WS-02). Same permission as the nav entry.
 */
export default function SettingsPage() {
  const t = useT();
  const router = useRouter();
  const [showClosed, setShowClosed] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const branches = useBranches(showClosed);
  const departments = useDepartments(showClosed);
  const positions = usePositions(showClosed);
  const createBranch = useOrgMutation(orgKeys.branches, (name: string) => orgApi.createBranch({ name }));
  const updateBranch = useOrgMutation(orgKeys.branches, (r: { id: string; body: UpdateBranchInput }) => orgApi.updateBranch(r.id, r.body));
  const toggleBranch = useOrgMutation(orgKeys.branches, (r: Toggle) => orgApi.setActive('branches', r.id, r.isActive));
  const deleteBranch = useOrgMutation(orgKeys.branches, orgApi.deleteBranch);
  const createDept = useOrgMutation(orgKeys.departments, (name: string) => orgApi.createDepartment({ name }));
  const updateDept = useOrgMutation(orgKeys.departments, (r: { id: string; body: UpdateDepartmentInput }) => orgApi.updateDepartment(r.id, r.body));
  const toggleDept = useOrgMutation(orgKeys.departments, (r: Toggle) => orgApi.setActive('departments', r.id, r.isActive));
  const deleteDept = useOrgMutation(orgKeys.departments, orgApi.deleteDepartment);
  const createPos = useOrgMutation(orgKeys.positions, (name: string) => orgApi.createPosition({ name }));
  const updatePos = useOrgMutation(orgKeys.positions, (r: { id: string; body: { name?: string; level?: number } }) => orgApi.updatePosition(r.id, r.body));
  const togglePos = useOrgMutation(orgKeys.positions, (r: Toggle) => orgApi.setActive('positions', r.id, r.isActive));
  const deletePos = useOrgMutation(orgKeys.positions, orgApi.deletePosition);

  const branchMeta = (b: Branch) =>
    `${b.latitude !== null ? `${t('orgx.branch.geofenceSummary').replace('{radius}', String(b.geofenceRadius))} · ` : ''}${b.employeeCount}`;
  const find = <T extends { id: string }>(rows: readonly T[] | undefined, id: string) => rows?.find((r) => r.id === id);
  /** Open departments, plus the current parent even when closed (so the select shows it). */
  const parentOptions = (self: Department) =>
    (departments.data ?? []).filter((d) => d.id !== self.id && (d.isActive || d.id === self.parentId)).map((d) => ({ value: d.id, label: d.name }));
  /** Send only what changed, so an untouched (e.g. closed, unlisted) parent is never cleared by accident. */
  const changedOnly = <T extends object>(body: T, before: object): Partial<T> =>
    Object.fromEntries(Object.entries(body).filter(([k, v]) => (before as Record<string, unknown>)[k] !== v)) as Partial<T>;

  return (
    <RequirePermission permission={PERMISSIONS.ORG_WRITE}>
      <PageHeader
        title={t('nav.settings')}
        actions={
          <Button variant="secondary" icon="event" onClick={() => router.push('/settings/holidays')}>
            {t('holiday.title')}
          </Button>
        }
      />
      <div className="mb-4">
        <Checkbox id="show-closed" label={t('orgx.showClosed')} checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <OrgEntityList
          title={t('org.branches')}
          testId="branches"
          canEdit
          items={(branches.data ?? []).map((b) => ({ id: b.id, name: b.name, meta: branchMeta(b), isActive: b.isActive }))}
          creating={createBranch.isPending}
          saving={toggleBranch.isPending || deleteBranch.isPending}
          error={createBranch.error ?? toggleBranch.error ?? deleteBranch.error}
          onCreate={(n) => createBranch.mutateAsync(n)}
          onEdit={(i) => {
            const item = find(branches.data, i.id);
            if (item) setEditing({ kind: 'branch', item });
          }}
          onSetActive={(id, isActive) => toggleBranch.mutateAsync({ id, isActive })}
          onDelete={(id) => deleteBranch.mutateAsync(id)}
        />
        <OrgEntityList
          title={t('org.departments')}
          testId="departments"
          canEdit
          items={(departments.data ?? []).map((d) => ({ id: d.id, name: d.name, meta: `${d.employeeCount}`, isActive: d.isActive }))}
          creating={createDept.isPending}
          saving={toggleDept.isPending || deleteDept.isPending}
          error={createDept.error ?? toggleDept.error ?? deleteDept.error}
          onCreate={(n) => createDept.mutateAsync(n)}
          onEdit={(i) => {
            const item = find(departments.data, i.id);
            if (item) setEditing({ kind: 'department', item });
          }}
          onSetActive={(id, isActive) => toggleDept.mutateAsync({ id, isActive })}
          onDelete={(id) => deleteDept.mutateAsync(id)}
        />
        <OrgEntityList
          title={t('org.positions')}
          testId="positions"
          canEdit
          items={(positions.data ?? []).map((p) => ({ id: p.id, name: p.name, meta: `${t('orgx.position.level')} ${p.level}`, isActive: p.isActive }))}
          creating={createPos.isPending}
          saving={togglePos.isPending || deletePos.isPending}
          error={createPos.error ?? togglePos.error ?? deletePos.error}
          onCreate={(n) => createPos.mutateAsync(n)}
          onEdit={(i) => {
            const item = find(positions.data, i.id);
            if (item) setEditing({ kind: 'position', item });
          }}
          onSetActive={(id, isActive) => togglePos.mutateAsync({ id, isActive })}
          onDelete={(id) => deletePos.mutateAsync(id)}
        />
      </div>

      <EntityFormDialog
        open={editing?.kind === 'branch'}
        title={t('orgx.branch.edit')}
        testId="branch-form"
        initial={editing?.kind === 'branch' ? branchFormValues(editing.item) : {}}
        saving={updateBranch.isPending}
        fields={[
          { name: 'name', label: t('empx.org.name'), required: true },
          { name: 'address', label: t('orgx.branch.address') },
          { name: 'latitude', label: t('orgx.branch.latitude'), type: 'number', step: 'any', section: t('orgx.branch.geofence'), hint: t('orgx.branch.geofenceHint') },
          { name: 'longitude', label: t('orgx.branch.longitude'), type: 'number', step: 'any' },
          {
            name: 'geofenceRadius',
            label: t('orgx.branch.radius'),
            type: 'number',
            step: '1',
            required: true,
            hint: t('orgx.branch.radiusHint').replace('{min}', String(GEOFENCE_RADIUS.min)).replace('{max}', String(GEOFENCE_RADIUS.max)),
          },
        ]}
        parse={parseBranchForm}
        onSubmit={(body) => updateBranch.mutateAsync({ id: editing!.item.id, body })}
        onClose={() => setEditing(null)}
      />
      <EntityFormDialog
        open={editing?.kind === 'department'}
        title={t('common.edit')}
        testId="department-form"
        initial={editing?.kind === 'department' ? departmentFormValues(editing.item) : {}}
        saving={updateDept.isPending}
        fields={[
          { name: 'name', label: t('empx.org.name'), required: true },
          {
            name: 'parentId',
            label: t('orgx.department.parent'),
            type: 'select',
            options: editing?.kind === 'department' ? parentOptions(editing.item) : [],
          },
        ]}
        parse={parseDepartmentForm}
        onSubmit={(body) => updateDept.mutateAsync({ id: editing!.item.id, body: changedOnly(body, editing!.item) })}
        onClose={() => setEditing(null)}
      />
      <EntityFormDialog
        open={editing?.kind === 'position'}
        title={t('common.edit')}
        testId="position-form"
        initial={editing?.kind === 'position' ? positionFormValues(editing.item) : {}}
        saving={updatePos.isPending}
        fields={[
          { name: 'name', label: t('empx.org.name'), required: true },
          { name: 'level', label: t('orgx.position.level'), type: 'number', step: '1' },
        ]}
        parse={parsePositionForm}
        onSubmit={(body) => updatePos.mutateAsync({ id: editing!.item.id, body })}
        onClose={() => setEditing(null)}
      />
    </RequirePermission>
  );
}
