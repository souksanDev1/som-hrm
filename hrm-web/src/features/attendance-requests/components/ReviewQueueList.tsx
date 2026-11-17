'use client';
import { interpolate, type ReviewDecisionInput, type ReviewPunch } from '@hrm/shared';
import { useEffect, useState } from 'react';
import { Badge, Button, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { attendanceRequestsApi } from '../api';

/** Google Maps link of a punch location (FR-ATT-14: HR checks where it was made). */
export const mapLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

export interface SelfieThumbProps {
  fileId: string;
  /** Resolves an object URL for the file (defaults to GET /files/:id through the authorised client). */
  loadUrl?(fileId: string): Promise<string>;
}

/** Selfie thumbnail fetched with the bearer token (an <img src> cannot send it). */
export function SelfieThumb({ fileId, loadUrl = attendanceRequestsApi.fileObjectUrl }: SelfieThumbProps) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    loadUrl(fileId)
      .then((u) => {
        created = u;
        if (alive) setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (created?.startsWith('blob:')) URL.revokeObjectURL(created);
    };
  }, [fileId, loadUrl]);
  return url ? (
    <img src={url} alt={t('attreq.review.selfie')} data-testid="review-selfie" className="h-20 w-20 rounded-sm border border-line object-cover dark:border-night-line" />
  ) : (
    <div className="h-20 w-20 rounded-sm border border-dashed border-line dark:border-night-line" aria-hidden />
  );
}

export interface ReviewItemProps {
  punch: ReviewPunch;
  onDecide(body: ReviewDecisionInput): Promise<unknown>;
  loadSelfie?: SelfieThumbProps['loadUrl'];
}

/** One suspicious punch with its reasons, location, selfie and the approve / reject controls. */
export function ReviewItem({ punch, onDecide, loadSelfie }: ReviewItemProps) {
  const t = useT();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReviewDecisionInput['decision'] | null>(null);
  const noteId = `review-note-${punch.id}`;

  const decide = async (decision: ReviewDecisionInput['decision']) => {
    const trimmed = note.trim();
    if (decision === 'REJECTED' && !trimmed) {
      setError('attreq.review.noteRequired');
      return;
    }
    setError(null);
    setBusy(decision);
    try {
      await onDecide({ decision, note: trimmed || undefined });
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'unknown');
    } finally {
      setBusy(null);
    }
  };

  return (
    <li data-testid="review-item" className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0 dark:border-night-line sm:flex-row">
      <div className="shrink-0">{punch.selfieFileId ? <SelfieThumb fileId={punch.selfieFileId} loadUrl={loadSelfie} /> : <p className="text-xs text-ink-muted">{t('attreq.review.noSelfie')}</p>}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink dark:text-night-ink">
            {punch.employee.employeeCode} · {punch.employee.name}
          </span>
          <Badge tone="primary">{t(`attendance.kind.${punch.kind}`)}</Badge>
          <Badge>{t(`attendance.source.${punch.source}`)}</Badge>
          {punch.offline && <Badge tone="warning">{t('attendance.offline')}</Badge>}
        </div>
        <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-ink-muted">{t('attreq.review.captured')}: </dt>
            <dd className="inline" data-testid="review-captured">{punch.capturedLocal}</dd>
          </div>
          <div>
            <dt className="inline text-ink-muted">{t('attreq.review.received')}: </dt>
            <dd className="inline">{punch.receivedLocal}</dd>
          </div>
          {punch.branch && (
            <div>
              <dt className="inline text-ink-muted">{t('employee.branch')}: </dt>
              <dd className="inline">{punch.branch.name}</dd>
            </div>
          )}
          {punch.latitude !== null && punch.longitude !== null && (
            <div>
              <a href={mapLink(punch.latitude, punch.longitude)} target="_blank" rel="noreferrer" className="text-primary underline" data-testid="review-map">
                {t('attreq.review.map')}
              </a>
              {punch.distanceMetres !== null && <span className="ml-2 text-ink-muted">{interpolate(t('attendance.distance'), { metres: Math.round(punch.distanceMetres) })}</span>}
            </div>
          )}
        </dl>
        <div>
          <p className="text-xs text-ink-muted">{t('attreq.review.reasons')}</p>
          <ul className="flex flex-wrap gap-1" data-testid="review-reasons">
            {punch.suspiciousReasons.map((r) => (
              <li key={r}>
                <Badge tone="danger">{t(`attendance.suspicion.${r}`)}</Badge>
              </li>
            ))}
          </ul>
        </div>
        <Field label={t('attreq.review.note')} htmlFor={noteId} error={error ? t(error) : undefined}>
          <Input id={noteId} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="danger" loading={busy === 'REJECTED'} disabled={!!busy} onClick={() => void decide('REJECTED')} data-testid="review-reject">
            {t('attreq.review.reject')}
          </Button>
          <Button loading={busy === 'APPROVED'} disabled={!!busy} onClick={() => void decide('APPROVED')} data-testid="review-approve">
            {t('attreq.review.approve')}
          </Button>
        </div>
      </div>
    </li>
  );
}

export interface ReviewQueueListProps {
  items: readonly ReviewPunch[];
  onDecide(id: string, body: ReviewDecisionInput): Promise<unknown>;
  loadSelfie?: SelfieThumbProps['loadUrl'];
}

export function ReviewQueueList({ items, onDecide, loadSelfie }: ReviewQueueListProps) {
  return (
    <ul data-testid="review-list">
      {items.map((p) => (
        <ReviewItem key={p.id} punch={p} onDecide={(body) => onDecide(p.id, body)} loadSelfie={loadSelfie} />
      ))}
    </ul>
  );
}
