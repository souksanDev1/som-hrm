'use client';
import { SEAT_LIMIT_MAX, type PlatformWorkspace } from '@hrm/shared';
import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Input, Modal } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { useUpdateWorkspace } from '../hooks';
import { WorkspaceStatusBadge } from './WorkspaceStatusBadge';

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-sm font-medium tabular-nums text-ink dark:text-night-ink">{value}</dd>
    </div>
  );
}

/** Workspace facts plus seat-limit and suspend/activate controls. */
export function WorkspaceDetail({ workspace }: { workspace: PlatformWorkspace }) {
  const t = useT();
  const update = useUpdateWorkspace(workspace.id);
  const [seatLimit, setSeatLimit] = useState(String(workspace.seatLimit));
  const [confirming, setConfirming] = useState(false);
  const errorCode = update.error instanceof ApiError ? update.error.code : update.error ? 'unknown' : null;
  const suspended = workspace.status === 'SUSPENDED';

  const saveSeats = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({ seatLimit: Number(seatLimit) });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card title={workspace.name} actions={<WorkspaceStatusBadge status={workspace.status} />} className="lg:col-span-2">
        <dl className="flex flex-col gap-3">
          <Row label={t('platform.workspace.code')} value={workspace.code} />
          <Row label={t('platform.workspace.timezone')} value={workspace.timezone} />
          <Row label={t('platform.workspace.seats')} value={`${workspace.employeeCount} / ${workspace.seatLimit}`} />
          <Row label={t('platform.workspace.users')} value={workspace.userCount} />
          <Row label={t('platform.workspace.createdAt')} value={workspace.createdAt.slice(0, 10)} />
        </dl>
      </Card>
      <div className="flex flex-col gap-4">
        <Card title={t('platform.workspace.seatLimit')}>
          <form onSubmit={saveSeats} noValidate className="flex items-end gap-2" data-testid="seat-limit-form">
            <Field label={t('platform.workspace.seatLimit')} htmlFor="seat-limit" className="flex-1">
              <Input id="seat-limit" type="number" min={1} max={SEAT_LIMIT_MAX} value={seatLimit} onChange={(e) => setSeatLimit(e.target.value)} />
            </Field>
            <Button type="submit" loading={update.isPending && update.variables?.seatLimit !== undefined}>
              {t('common.save')}
            </Button>
          </form>
        </Card>
        <Card title={t('platform.workspace.status')}>
          <Button
            fullWidth
            variant={suspended ? 'primary' : 'danger'}
            icon={suspended ? 'play_arrow' : 'block'}
            data-testid="toggle-workspace-status"
            loading={update.isPending && update.variables?.status !== undefined}
            onClick={() => (suspended ? update.mutate({ status: 'ACTIVE' }) : setConfirming(true))}
          >
            {t(suspended ? 'platform.workspace.activate' : 'platform.workspace.suspend')}
          </Button>
        </Card>
        {errorCode && (
          <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
            {t(errorCode)}
          </p>
        )}
      </div>
      <Modal
        open={confirming}
        title={t('platform.workspace.suspend')}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              data-testid="confirm-suspend"
              onClick={() => {
                setConfirming(false);
                update.mutate({ status: 'SUSPENDED' });
              }}
            >
              {t('platform.workspace.suspend')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink dark:text-night-ink">{t('platform.workspace.suspendConfirm')}</p>
      </Modal>
    </div>
  );
}
