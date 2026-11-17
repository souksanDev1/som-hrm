'use client';
import { isoDateInTimeZone, type Delegation } from '@hrm/shared';
import { useState } from 'react';
import { Button, Card, ConfirmDialog, Modal, QueryState } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { ApiErrorText } from '@/features/auth/components/ApiErrorText';
import { fill } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';
import { useCancelDelegation, useCreateDelegation, useDelegateCandidates, useDelegations, useUpdateDelegation } from '../hooks';
import { DelegationStatusBadge } from './ApprovalBadges';
import { DelegationForm } from './DelegationForm';

/** The browser's calendar date; the API re-checks against the workspace time zone. */
const browserToday = () => isoDateInTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);

/**
 * Approval delegates (FR-ORG-03.1) on the account page: a manager appoints, edits and cancels their
 * own; HR (`approval.delegate.manage`) sees everyone's and may appoint for another manager.
 * Hidden for users who neither delegate nor act as anyone's delegate.
 */
export function DelegationsCard() {
  const t = useT();
  const userId = useAuthStore((s) => s.user?.id);
  const list = useDelegations();
  const candidates = useDelegateCandidates(!!list.data?.canDelegate);
  const create = useCreateDelegation();
  const update = useUpdateDelegation();
  const cancel = useCancelDelegation();
  const [editing, setEditing] = useState<Delegation | 'new' | null>(null);
  const [cancelling, setCancelling] = useState<Delegation | null>(null);
  const today = browserToday();

  if (list.data && !list.data.canDelegate && list.data.items.length === 0) return null;
  const canChange = (d: Delegation) =>
    (d.status === 'ACTIVE' || d.status === 'SCHEDULED') && (d.delegator.userId === userId || !!list.data?.canManageAll);

  return (
    <Card
      title={t('delegation.title')}
      data-testid="delegations-card"
      actions={
        list.data?.canDelegate && (
          <Button size="sm" icon="add" onClick={() => setEditing('new')} data-testid="delegation-add">
            {t('delegation.add')}
          </Button>
        )
      }
    >
      <p className="mb-3 text-sm text-ink-muted">{t('delegation.subtitle')}</p>
      <QueryState query={list}>
        {(data) =>
          data.items.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('delegation.empty')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line dark:divide-night-line">
              {data.items.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="delegation-row">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink dark:text-night-ink">
                      {d.delegator.userId === userId ? t('delegation.me') : d.delegator.name} → {d.delegate.userId === userId ? t('delegation.me') : d.delegate.name}
                    </p>
                    <p className="text-ink-muted" data-testid="delegation-period">
                      {fill(t('delegation.period'), { start: d.startDate, end: d.endDate })}
                      {d.reason ? ` · ${d.reason}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <DelegationStatusBadge status={d.status} />
                    {canChange(d) && (
                      <>
                        <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(d)} data-testid="delegation-edit">
                          {t('delegation.edit')}
                        </Button>
                        <Button size="sm" variant="ghost" icon="block" onClick={() => setCancelling(d)} data-testid="delegation-cancel">
                          {t('delegation.cancel')}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>

      <Modal open={editing !== null} title={t(editing === 'new' ? 'delegation.add' : 'delegation.edit')} onClose={() => setEditing(null)}>
        {editing !== null && (
          <DelegationForm
            key={editing === 'new' ? 'new' : editing.id}
            candidates={candidates.data ?? []}
            today={today}
            initial={editing === 'new' ? undefined : editing}
            canPickDelegator={!!list.data?.canManageAll}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              if (editing === 'new') await create.mutateAsync(input);
              else await update.mutateAsync({ id: editing.id, body: { delegateUserId: input.delegateUserId, startDate: input.startDate, endDate: input.endDate, reason: input.reason } });
              setEditing(null);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={cancelling !== null}
        title={t('delegation.cancel')}
        message={
          <>
            {cancelling && fill(t('delegation.cancelConfirm'), { name: cancelling.delegate.name })}
            <ApiErrorText error={cancel.error} />
          </>
        }
        confirmLabel={t('delegation.cancel')}
        tone="danger"
        loading={cancel.isPending}
        onCancel={() => {
          cancel.reset();
          setCancelling(null);
        }}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id, { onSuccess: () => setCancelling(null) })}
      />
    </Card>
  );
}
