'use client';
import { interpolate, type KioskDevice } from '@hrm/shared';
import { useState } from 'react';
import { Badge, Button, ConfirmDialog, StateView } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

/** `YYYY-MM-DD HH:mm` in the browser's time zone. */
export const localDateTime = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export interface KioskListProps {
  kiosks: readonly KioskDevice[];
  onRevoke(id: string): Promise<unknown>;
}

/** Enrolled kiosk tablets with branch, last seen and status; active ones can be revoked (FR-ATT-03.1). */
export function KioskList({ kiosks, onRevoke }: KioskListProps) {
  const t = useT();
  const [pending, setPending] = useState<KioskDevice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!kiosks.length) return <StateView kind="empty" title={t('kiosk.empty')} />;

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await onRevoke(pending.id);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'unknown');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <>
      {error && (
        <p role="alert" data-testid="kiosk-error" className="mb-2 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(error)}
        </p>
      )}
      <ul className="divide-y divide-line dark:divide-night-line" data-testid="kiosk-list">
        {kiosks.map((k) => (
          <li key={k.id} data-testid="kiosk-row" className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium text-ink dark:text-night-ink">{k.name}</p>
              <p className="text-xs text-ink-muted">
                {k.branchName} · {t('kiosk.lastSeen')}:{' '}
                <span data-testid="kiosk-last-seen">{k.lastSeenAt ? localDateTime(k.lastSeenAt) : t('kiosk.neverSeen')}</span>
              </p>
              <p className="text-xs text-ink-muted">
                {t('kiosk.createdAt')} {localDateTime(k.createdAt)}
                {k.enrolledByName ? ` · ${t('kiosk.enrolledBy')} ${k.enrolledByName}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={k.revokedAt ? 'neutral' : 'success'}>{t(k.revokedAt ? 'kiosk.status.revoked' : 'kiosk.status.active')}</Badge>
              {!k.revokedAt && (
                <Button size="sm" variant="secondary" icon="block" onClick={() => setPending(k)} data-testid="kiosk-revoke">
                  {t('kiosk.revoke')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!pending}
        title={t('kiosk.revokeTitle')}
        message={interpolate(t('kiosk.revokeMessage'), { name: pending?.name ?? '' })}
        confirmLabel={t('kiosk.revoke')}
        tone="danger"
        loading={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
