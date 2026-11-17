'use client';
import { PERMISSIONS, type Shift } from '@hrm/shared';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, ConfirmDialog, QueryState } from '@/components/ui';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { EntityFormDialog } from '@/features/org/components/EntityFormDialog';
import { fill } from '@/features/settings/parameters/format';
import { shiftsApi } from '@/features/shifts/api';
import { ShiftList } from '@/features/shifts/components/ShiftList';
import { emptyShiftValues, parseShiftForm, shiftFormValues, type ShiftFormData } from '@/features/shifts/form';
import { useShiftMutation, useShifts } from '@/features/shifts/hooks';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

type Editing = { mode: 'create' } | { mode: 'edit'; shift: Shift } | null;

/** Shift settings (FR-ATT-17.1/17.2): times, break, grace overrides, colour; night shifts are badged. */
export default function ShiftsPage() {
  const t = useT();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Shift | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useShifts();
  const create = useShiftMutation(({ isActive: _active, ...body }: ShiftFormData) => shiftsApi.create(body));
  const update = useShiftMutation((r: { id: string; body: ShiftFormData }) => shiftsApi.update(r.id, r.body));
  const remove = useShiftMutation(shiftsApi.remove);

  const fields = [
    { name: 'name', label: t('shifts.name'), required: true },
    { name: 'code', label: t('shifts.code'), hint: t('shifts.codeHint') },
    { name: 'color', label: t('shifts.color'), placeholder: '#1E3A8A', hint: '#RRGGBB' },
    { name: 'startTime', label: t('shifts.startTime'), type: 'time' as const, required: true },
    { name: 'endTime', label: t('shifts.endTime'), type: 'time' as const, required: true },
    { name: 'breakMinutes', label: t('shifts.breakMinutes'), type: 'number' as const, required: true },
    { name: 'lateGraceMinutes', label: t('shifts.lateGrace'), type: 'number' as const, hint: t('shifts.graceHint') },
    { name: 'earlyGraceMinutes', label: t('shifts.earlyGrace'), type: 'number' as const, hint: t('shifts.graceHint') },
    ...(editing?.mode === 'edit' ? [{ name: 'isActive', label: t('shifts.active'), type: 'checkbox' as const }] : []),
  ];

  return (
    <RequirePermission permission={PERMISSIONS.SHIFT_MANAGE}>
      <PageHeader
        title={t('shifts.title')}
        description={t('shifts.subtitle')}
        actions={
          <Button icon="add" onClick={() => setEditing({ mode: 'create' })} data-testid="shift-add">
            {t('shifts.add')}
          </Button>
        }
      />
      <Card>
        {notice && <p role="status" data-testid="shift-notice" className="mb-2 text-sm text-success">{notice}</p>}
        {remove.error ? <p role="alert" className="mb-2 text-sm text-danger">{t(remove.error instanceof ApiError ? remove.error.code : 'unknown')}</p> : null}
        <QueryState query={query}>
          {(shifts) => <ShiftList shifts={shifts} onEdit={(s) => setEditing({ mode: 'edit', shift: s })} onDelete={setDeleting} />}
        </QueryState>
      </Card>

      <EntityFormDialog
        open={!!editing}
        title={t(editing?.mode === 'edit' ? 'shifts.edit' : 'shifts.add')}
        testId="shift-form"
        initial={editing?.mode === 'edit' ? shiftFormValues(editing.shift) : emptyShiftValues()}
        saving={create.isPending || update.isPending}
        fields={fields}
        parse={parseShiftForm}
        onSubmit={(body) => (editing?.mode === 'edit' ? update.mutateAsync({ id: editing.shift.id, body }) : create.mutateAsync(body))}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        title={t('shifts.deleteTitle')}
        message={fill(t('shifts.deleteMessage'), { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          void remove
            .mutateAsync(deleting.id)
            .then((r) => setNotice(t(r.result === 'deleted' ? 'shifts.deleted' : 'shifts.deactivated')))
            .catch(() => undefined)
            .finally(() => setDeleting(null));
        }}
      />
    </RequirePermission>
  );
}
