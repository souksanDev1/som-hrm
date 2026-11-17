'use client';
import { PERMISSIONS } from '@hrm/shared';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, Checkbox, Modal, Pagination, QueryState, StateView } from '@/components/ui';
import { OffsiteForm, OffsiteList } from '@/features/attendance-requests/components/OffsitePermissions';
import { useCreateOffsite, useOffsitePermissions, useRevokeOffsite } from '@/features/attendance-requests/hooks';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { useT } from '@/lib/i18n';

/** Off-site check-in permissions (FR-ATT-16.1). */
export default function OffsitePermissionsPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const query = useOffsitePermissions({ page, includeInactive });
  const create = useCreateOffsite();
  const revoke = useRevokeOffsite();
  return (
    <RequirePermission permission={PERMISSIONS.ATTENDANCE_OFFSITE_MANAGE}>
      <PageHeader
        title={t('attreq.offsite.title')}
        description={t('attreq.offsite.subtitle')}
        actions={
          <Button icon="add" onClick={() => setAdding(true)} data-testid="offsite-add">
            {t('attreq.offsite.add')}
          </Button>
        }
      />
      <Card>
        <Checkbox
          id="offsite-inactive"
          label={t('attreq.offsite.includeInactive')}
          checked={includeInactive}
          onChange={(e) => {
            setIncludeInactive(e.target.checked);
            setPage(1);
          }}
        />
        <QueryState query={query}>
          {(data) =>
            data.items.length === 0 ? (
              <StateView kind="empty" title={t('attreq.offsite.empty')} />
            ) : (
              <>
                <OffsiteList items={data.items} onRevoke={(id) => revoke.mutateAsync(id)} />
                <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} labels={{ previous: t('common.previous'), next: t('common.next') }} />
              </>
            )
          }
        </QueryState>
      </Card>
      <Modal open={adding} title={t('attreq.offsite.add')} onClose={() => setAdding(false)}>
        <OffsiteForm
          onCancel={() => setAdding(false)}
          onSubmit={async (input) => {
            await create.mutateAsync(input);
            setAdding(false);
          }}
        />
      </Modal>
    </RequirePermission>
  );
}
