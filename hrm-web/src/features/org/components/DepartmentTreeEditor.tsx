'use client';
import type { Department, OrgStructureNode, UpdateDepartmentInput } from '@hrm/shared';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, Checkbox, ConfirmDialog, Icon, QueryState, type SelectOption } from '@/components/ui';
import { useHeadOptions } from '@/features/employees/hooks';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { orgApi } from '../api';
import { departmentFormValues, parseDepartmentForm } from '../forms';
import { orgKeys, useDepartments, useOrgMutation, useOrgStructure } from '../hooks';
import { EntityFormDialog } from './EntityFormDialog';


type Editing = { mode: 'edit'; dept: Department } | { mode: 'create'; parentId: string | null } | null;
type Confirming = { kind: 'close' | 'delete'; dept: Department } | null;

/** Depth-first rows with their depth; a department whose parent is not listed is a root. */
const toRows = (departments: readonly Department[]) => {
  const ids = new Set(departments.map((d) => d.id));
  const children = new Map<string | null, Department[]>();
  departments.forEach((d) => {
    const key = d.parentId && ids.has(d.parentId) ? d.parentId : null;
    children.set(key, [...(children.get(key) ?? []), d]);
  });
  const rows: { dept: Department; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    [...(children.get(parent) ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((d) => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        rows.push({ dept: d, depth });
        walk(d.id, depth + 1);
      });
  };
  walk(null, 0);
  return { rows, children };
};

/** Ids of `id` and everything below it (never valid as its new parent). */
const subtree = (id: string, children: Map<string | null, Department[]>): Set<string> => {
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    for (const c of children.get(stack.pop()!) ?? []) {
      if (!out.has(c.id)) {
        out.add(c.id);
        stack.push(c.id);
      }
    }
  }
  return out;
};

/** Department id → head name, from the structure tree. */
export const structureHeadNames = (roots: readonly OrgStructureNode[] | undefined, out = new Map<string, string>()) => {
  roots?.forEach((n) => {
    if (n.head) out.set(n.id, n.head.name);
    structureHeadNames(n.children, out);
  });
  return out;
};

/** Structure editor: departments as an indented tree with edit, add sub-unit, close/reopen and delete. */
export function DepartmentTreeEditor() {
  const t = useT();
  const [showClosed, setShowClosed] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const departments = useDepartments(showClosed);
  const structure = useOrgStructure();
  const heads = useHeadOptions();

  const create = useOrgMutation(orgKeys.all, (body: UpdateDepartmentInput) =>
    orgApi.createDepartment({ name: body.name ?? '', parentId: body.parentId ?? undefined, headEmployeeId: body.headEmployeeId ?? undefined }),
  );
  const update = useOrgMutation(orgKeys.all, (r: { id: string; body: UpdateDepartmentInput }) => orgApi.updateDepartment(r.id, r.body));
  const setActive = useOrgMutation(orgKeys.all, (r: { id: string; isActive: boolean }) => orgApi.setActive<Department>('departments', r.id, r.isActive));
  const remove = useOrgMutation(orgKeys.all, (id: string) => orgApi.deleteDepartment(id));

  const { rows, children } = useMemo(() => toRows(departments.data ?? []), [departments.data]);
  const headName = useMemo(() => structureHeadNames(structure.data), [structure.data]);
  const error = create.error ?? update.error ?? setActive.error ?? remove.error;
  const errorCode = error instanceof ApiError ? error.code : error ? 'unknown' : null;

  const parentOptions = (): SelectOption[] => {
    const exclude = editing?.mode === 'edit' ? subtree(editing.dept.id, children) : new Set<string>();
    const current = editing?.mode === 'edit' ? editing.dept.parentId : null;
    return (departments.data ?? [])
      .filter((d) => !exclude.has(d.id) && (d.isActive || d.id === current))
      .map((d) => ({ value: d.id, label: d.name }));
  };
  const headOptions = (): SelectOption[] => {
    const loaded = heads.data ?? [];
    const currentId = editing?.mode === 'edit' ? editing.dept.headEmployeeId : null;
    // Keep the current head selectable even when it is not among the loaded options.
    return currentId && !loaded.some((o) => o.value === currentId)
      ? [{ value: currentId, label: headName.get(editing!.mode === 'edit' ? editing!.dept.id : '') ?? currentId }, ...loaded]
      : loaded;
  };
  /** Send only what changed, so an untouched (e.g. closed) parent is never cleared by accident. */
  const changedOnly = (body: UpdateDepartmentInput, before: Department): UpdateDepartmentInput =>
    Object.fromEntries(Object.entries(body).filter(([k, v]) => (before as unknown as Record<string, unknown>)[k] !== v)) as UpdateDepartmentInput;

  const runConfirm = async () => {
    if (!confirming) return;
    try {
      if (confirming.kind === 'close') await setActive.mutateAsync({ id: confirming.dept.id, isActive: false });
      else await remove.mutateAsync(confirming.dept.id);
    } catch {
      // Shown through `error` above the list.
    }
    setConfirming(null);
  };

  const action = 'rounded p-1 text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-40 dark:hover:bg-night-line';
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Checkbox id="show-closed" label={t('orgx.showClosed')} checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
        <Button icon="add" onClick={() => setEditing({ mode: 'create', parentId: null })} data-testid="dept-add-root">
          {t('org.manage.addRoot')}
        </Button>
      </div>
      {errorCode && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {t(errorCode === 'in_use' ? 'orgx.inUseHint' : errorCode)}
        </p>
      )}
      <QueryState query={departments} isEmpty={(d) => d.length === 0}>
        {() => (
          <ul className="flex flex-col">
            {rows.map(({ dept, depth }) => (
              <li
                key={dept.id}
                data-testid={`dept-row-${dept.id}`}
                className={cn('flex items-center gap-2 border-b border-line py-2 last:border-b-0 dark:border-night-line', !dept.isActive && 'opacity-60')}
                style={{ paddingLeft: `${Math.min(depth, 8) * 1.5}rem` }}
              >
                <Icon name={depth === 0 ? 'apartment' : 'subdirectory_arrow_right'} className="text-[20px] text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 truncate text-sm font-medium text-ink dark:text-night-ink">
                    {dept.name}
                    {!dept.isActive && <Badge>{t('orgx.closed')}</Badge>}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {t('orgx.department.head')}: {headName.get(dept.id) ?? t('orgx.department.noHead')} · {dept.employeeCount} {t('org.structure.employees')}
                  </span>
                </span>
                <button type="button" className={action} onClick={() => setEditing({ mode: 'edit', dept })} data-testid={`dept-edit-${dept.id}`} aria-label={t('orgx.edit')} title={t('orgx.edit')}>
                  <Icon name="edit" className="text-[20px]" />
                </button>
                <button
                  type="button"
                  className={action}
                  disabled={!dept.isActive}
                  onClick={() => setEditing({ mode: 'create', parentId: dept.id })}
                  data-testid={`dept-add-sub-${dept.id}`}
                  aria-label={t('org.manage.addSub')}
                  title={t('org.manage.addSub')}
                >
                  <Icon name="add_circle" className="text-[20px]" />
                </button>
                <button
                  type="button"
                  className={action}
                  onClick={() => (dept.isActive ? setConfirming({ kind: 'close', dept }) : void setActive.mutateAsync({ id: dept.id, isActive: true }).catch(() => undefined))}
                  data-testid={`dept-toggle-active-${dept.id}`}
                  aria-label={dept.isActive ? t('orgx.close') : t('orgx.reopen')}
                  title={dept.isActive ? t('orgx.close') : t('orgx.reopen')}
                >
                  <Icon name={dept.isActive ? 'block' : 'restart_alt'} className="text-[20px]" />
                </button>
                <button
                  type="button"
                  className={cn(action, 'hover:text-danger')}
                  onClick={() => setConfirming({ kind: 'delete', dept })}
                  data-testid={`dept-delete-${dept.id}`}
                  aria-label={t('common.delete')}
                  title={t('common.delete')}
                >
                  <Icon name="delete" className="text-[20px]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      <EntityFormDialog
        open={editing !== null}
        title={editing?.mode === 'create' ? (editing.parentId ? t('org.manage.addSub') : t('org.manage.addRoot')) : t('common.edit')}
        testId="department-form"
        initial={editing?.mode === 'edit' ? departmentFormValues(editing.dept) : { name: '', parentId: editing?.parentId ?? '', headEmployeeId: '' }}
        saving={create.isPending || update.isPending}
        fields={[
          { name: 'name', label: t('empx.org.name'), required: true },
          { name: 'parentId', label: t('orgx.department.parent'), type: 'select', options: parentOptions() },
          { name: 'headEmployeeId', label: t('orgx.department.head'), type: 'select', options: headOptions() },
        ]}
        parse={parseDepartmentForm}
        onSubmit={(body) =>
          editing?.mode === 'edit' ? update.mutateAsync({ id: editing.dept.id, body: changedOnly(body, editing.dept) }) : create.mutateAsync(body)
        }
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.kind === 'delete' ? t('common.delete') : t('orgx.closeTitle')}
        message={confirming?.kind === 'delete' ? confirming.dept.name : t('orgx.closeMessage').replace('{name}', confirming?.dept.name ?? '')}
        confirmLabel={confirming?.kind === 'delete' ? t('common.delete') : t('orgx.close')}
        tone="danger"
        loading={setActive.isPending || remove.isPending}
        onConfirm={() => void runConfirm()}
        onCancel={() => setConfirming(null)}
      />
    </Card>
  );
}
