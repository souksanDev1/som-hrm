'use client';
import { PERMISSIONS, type LeaveType } from '@hrm/shared';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, Modal, QueryState } from '@/components/ui';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { leavePolicyApi } from '@/features/leave-policy/api';
import { LeaveTypeForm } from '@/features/leave-policy/components/LeaveTypeForm';
import { LeaveTypeList } from '@/features/leave-policy/components/LeaveTypeList';
import { useLeavePolicyMutation, useLeaveTypes } from '@/features/leave-policy/hooks';
import { useT } from '@/lib/i18n';

type Editing = { mode: 'create' } | { mode: 'edit'; type: LeaveType } | null;

/** Leave type settings (FR-LV-01/02): days and rules per type within the legal minimum, plus custom types. */
export default function LeaveTypesPage() {
  const t = useT();
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useLeaveTypes();
  const create = useLeavePolicyMutation(leavePolicyApi.createType);
  const update = useLeavePolicyMutation((r: { id: string; body: Parameters<typeof leavePolicyApi.updateType>[1] }) => leavePolicyApi.updateType(r.id, r.body));
  const saved = () => {
    setEditing(null);
    setNotice(t('lvp.types.saved'));
  };

  return (
    <RequirePermission permission={PERMISSIONS.LEAVE_MANAGE}>
      <PageHeader
        title={t('lvp.types.title')}
        description={t('lvp.types.subtitle')}
        actions={
          <Button icon="add" onClick={() => setEditing({ mode: 'create' })} data-testid="leave-type-add">
            {t('lvp.types.add')}
          </Button>
        }
      />
      <Card>
        {notice && <p data-testid="leave-type-notice" className="mb-2 text-sm text-success">{notice}</p>}
        <QueryState query={query}>{(types) => <LeaveTypeList types={types} onEdit={(type) => setEditing({ mode: 'edit', type })} />}</QueryState>
      </Card>
      <Modal open={!!editing} title={t(editing?.mode === 'edit' ? 'lvp.types.edit' : 'lvp.types.add')} onClose={() => setEditing(null)}>
        {editing?.mode === 'edit' ? (
          <LeaveTypeForm
            key={editing.type.id}
            mode="edit"
            type={editing.type}
            onCancel={() => setEditing(null)}
            onSubmit={(body) => update.mutateAsync({ id: editing.type.id, body }).then(saved)}
          />
        ) : editing ? (
          <LeaveTypeForm key="create" mode="create" onCancel={() => setEditing(null)} onSubmit={(body) => create.mutateAsync(body).then(saved)} />
        ) : null}
      </Modal>
    </RequirePermission>
  );
}
