'use client';
import { interpolate, type EmployeeDevices } from '@hrm/shared';
import { useState } from 'react';
import { Badge, Button, ConfirmDialog, StateView } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

const statusTone = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' } as const;

export interface DeviceListProps {
  devices: EmployeeDevices;
  onReset(bindingId: string): Promise<unknown>;
}

/** An employee's bound phones (FR-ATT-11.1) with HR reset, and their device change requests (11.2/11.3). */
export function DeviceList({ devices, onReset }: DeviceListProps) {
  const t = useT();
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!devices.hasLogin) return <StateView kind="empty" title={t('attreq.devices.noLogin')} />;

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await onReset(pending);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'unknown');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink dark:text-night-ink">{t('attreq.devices.bindings')}</h3>
        {error && (
          <p role="alert" data-testid="device-error" className="mb-2 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
            {t(error)}
          </p>
        )}
        {devices.bindings.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('attreq.devices.none')}</p>
        ) : (
          <ul className="divide-y divide-line dark:divide-night-line" data-testid="device-bindings">
            {devices.bindings.map((b) => (
              <li key={b.id} data-testid="device-binding" className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink dark:text-night-ink">{b.model ?? b.deviceId}</p>
                  <p className="break-all text-xs text-ink-muted">
                    {b.platform} · {b.deviceId}
                    {b.lastSeenAt ? ` · ${interpolate(t('attreq.devices.lastSeen'), { time: b.lastSeenAt.slice(0, 10) })}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={b.isActive ? 'success' : 'neutral'}>{t(b.isActive ? 'attreq.devices.active' : 'attreq.devices.inactive')}</Badge>
                  {b.isActive && (
                    <Button size="sm" variant="secondary" onClick={() => setPending(b.id)} data-testid="device-reset">
                      {t('attreq.devices.reset')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {devices.requests.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink dark:text-night-ink">{t('attreq.devices.requests')}</h3>
          <ul className="divide-y divide-line dark:divide-night-line">
            {devices.requests.map((r) => (
              <li key={r.id} data-testid="device-request" className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink dark:text-night-ink">
                    {r.model ?? r.deviceId} · {r.platform}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {r.createdAt.slice(0, 10)} · {r.reason}
                  </p>
                </div>
                <Badge tone={statusTone[r.status]}>{t(`approval.status.${r.status}`)}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ConfirmDialog
        open={!!pending}
        title={t('attreq.devices.reset')}
        message={t('attreq.devices.resetConfirm')}
        confirmLabel={t('attreq.devices.reset')}
        tone="danger"
        loading={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
