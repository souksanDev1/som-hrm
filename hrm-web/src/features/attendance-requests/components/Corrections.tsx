'use client';
import { DOCUMENT_FILE_ACCEPT, interpolate, type Correction, type CreateCorrectionInput, type StoredFileRef } from '@hrm/shared';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Field, FileUpload, Input } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

type FieldName = 'workDate' | 'requestedCheckIn' | 'requestedCheckOut' | 'reason' | 'attachmentFileId' | 'form';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface CorrectionFormProps {
  onSubmit(input: CreateCorrectionInput): Promise<unknown>;
  /** Upload the attachment (POST /files?purpose=ATTACHMENT). */
  onUpload(file: File): Promise<StoredFileRef>;
  /** Called after a successful submit (e.g. to close the form). */
  onDone?(): void;
}

/** Request a correction of one's own check-in/out (FR-ATT-19.1). Times are "HH:mm" in the company time zone. */
export function CorrectionForm({ onSubmit, onUpload, onDone }: CorrectionFormProps) {
  const t = useT();
  const [workDate, setWorkDate] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState<StoredFileRef | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!workDate) next.workDate = 'required';
    if (checkIn && !TIME.test(checkIn)) next.requestedCheckIn = 'invalid_time';
    if (checkOut && !TIME.test(checkOut)) next.requestedCheckOut = 'invalid_time';
    if (!checkIn && !checkOut) next.requestedCheckIn = 'correction_time_required';
    if (!reason.trim()) next.reason = 'required';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      await onSubmit({
        workDate,
        requestedCheckIn: checkIn || undefined,
        requestedCheckOut: checkOut || undefined,
        reason: reason.trim(),
        attachmentFileId: attachment?.id,
      });
      onDone?.();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unknown';
      const field = err instanceof ApiError ? (err.details as { field?: FieldName } | undefined)?.field : undefined;
      setErrors({ [field ?? 'form']: code });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4" data-testid="correction-form">
      <Field label={t('attreq.correction.workDate')} htmlFor="corr-date" error={errors.workDate && t(errors.workDate)} required>
        <Input id="corr-date" type="date" value={workDate} invalid={!!errors.workDate} onChange={(e) => setWorkDate(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('attreq.correction.checkIn')} htmlFor="corr-in" error={errors.requestedCheckIn && t(errors.requestedCheckIn)} hint={t('attreq.correction.timeHint')}>
          <Input id="corr-in" type="time" value={checkIn} invalid={!!errors.requestedCheckIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label={t('attreq.correction.checkOut')} htmlFor="corr-out" error={errors.requestedCheckOut && t(errors.requestedCheckOut)} hint={t('attreq.correction.nextDayHint')}>
          <Input id="corr-out" type="time" value={checkOut} invalid={!!errors.requestedCheckOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
      </div>
      <Field label={t('attreq.correction.reason')} htmlFor="corr-reason" error={errors.reason && t(errors.reason)} required>
        <Input id="corr-reason" value={reason} maxLength={500} invalid={!!errors.reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink dark:text-night-ink">{t('attreq.correction.attachment')}</span>
        <FileUpload
          accept={DOCUMENT_FILE_ACCEPT}
          hint={t('attreq.correction.attachmentHint')}
          error={errors.attachmentFileId && t(errors.attachmentFileId)}
          onUpload={async (file) => setAttachment(await onUpload(file))}
          data-testid="correction-attachment"
        />
        {attachment && (
          <p className="text-xs text-ink-muted" data-testid="correction-attached">
            {interpolate(t('attreq.correction.attached'), { name: attachment.originalName })}
          </p>
        )}
      </div>
      {errors.form && (
        <p role="alert" data-testid="correction-error" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(errors.form)}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={submitting} data-testid="correction-submit">
          {t('attreq.correction.submit')}
        </Button>
      </div>
    </form>
  );
}

const statusTone = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' } as const;

/** Own correction requests with original vs requested times (FR-ATT-19.3 keeps both). */
export function CorrectionList({ items }: { items: readonly Correction[] }) {
  const t = useT();
  const time = (v: string | null) => v ?? t('attreq.correction.missing');
  const side = (label: string, s: Correction['checkIn']) =>
    s.requested ? (
      <p className="text-sm">
        <span className="text-ink-muted">{label}: </span>
        {t('attreq.correction.original')} {time(s.original)} → {t('attreq.correction.requested')} <strong>{s.requested}</strong>
      </p>
    ) : null;
  return (
    <ul data-testid="correction-list" className="divide-y divide-line dark:divide-night-line">
      {items.map((c) => (
        <li key={c.id} data-testid="correction-item" className="flex flex-col gap-1 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-ink dark:text-night-ink">{c.workDate}</span>
            <Badge tone={statusTone[c.status]}>{t(`approval.status.${c.status}`)}</Badge>
          </div>
          {side(t('attreq.correction.checkIn'), c.checkIn)}
          {side(t('attreq.correction.checkOut'), c.checkOut)}
          <p className="text-xs text-ink-muted">
            {c.reason}
            {c.attachment ? ` · ${c.attachment.originalName}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}
