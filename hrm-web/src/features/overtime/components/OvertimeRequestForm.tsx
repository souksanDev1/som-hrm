'use client';
import { OVERTIME_KINDS, type OvertimeInput, type OvertimePreview, type OvertimePreviewInput } from '@hrm/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { OvertimeCapLine, OvertimeSplitList } from './OvertimeSplit';

export interface OvertimeRequestFormProps {
  /** Default work date. */
  today: string;
  /** Server preview (split + caps); called while the user types. */
  onPreview(input: OvertimePreviewInput): Promise<OvertimePreview>;
  onSubmit(input: OvertimeInput): Promise<unknown>;
  onCancel?(): void;
  /** Delay before previewing after a change (ms). */
  debounceMs?: number;
}

const TIME_RE = /^\d{2}:\d{2}$/;
const codeOf = (err: unknown) => (err instanceof ApiError ? err.code : 'unknown');

/**
 * OT request (FR-ATT-20) with a live breakdown into the four categories and the day/month cap status
 * (FR-ATT-21/22). All numbers come from the API preview; over the cap the submit button is disabled.
 */
export function OvertimeRequestForm({ today, onPreview, onSubmit, onCancel, debounceMs = 300 }: OvertimeRequestFormProps) {
  const t = useT();
  const [kind, setKind] = useState<OvertimeInput['kind']>('PRE');
  const [workDate, setWorkDate] = useState(today);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<OvertimePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<'start' | 'end' | 'reason' | 'form', string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const complete = !!workDate && TIME_RE.test(start) && TIME_RE.test(end) && start !== end;
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (!complete) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      onPreview({ kind, workDate, start, end }).then(
        (p) => !cancelled && setPreview(p),
        (err: unknown) => !cancelled && setPreviewError(codeOf(err)),
      );
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // onPreview is a stable API call; re-run only when the period changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, workDate, start, end, complete, debounceMs]);

  const blocked = !!preview && (preview.day.exceeded || preview.month.exceeded);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!TIME_RE.test(start)) next.start = 'required';
    if (!TIME_RE.test(end)) next.end = 'required';
    else if (start === end) next.end = 'ot_invalid_period';
    if (!reason.trim()) next.reason = 'required';
    setErrors(next);
    if (Object.keys(next).length || blocked) return;
    setSubmitting(true);
    try {
      await onSubmit({ kind, workDate, start, end, reason: reason.trim() });
    } catch (err) {
      setErrors({ form: codeOf(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4" data-testid="ot-form">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('otx.kind')} htmlFor="ot-kind" required>
          <Select
            id="ot-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as OvertimeInput['kind'])}
            options={OVERTIME_KINDS.map((k) => ({ value: k, label: t(`otx.kind.${k}`) }))}
          />
        </Field>
        <Field label={t('otx.workDate')} htmlFor="ot-workDate" required>
          <Input id="ot-workDate" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
        </Field>
        <Field label={t('otx.start')} htmlFor="ot-start" error={errors.start && t(errors.start)} required>
          <Input id="ot-start" type="time" value={start} invalid={!!errors.start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t('otx.end')} htmlFor="ot-end" error={errors.end && t(errors.end)} hint={t('otx.endHint')} required>
          <Input id="ot-end" type="time" value={end} invalid={!!errors.end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label={t('otx.reason')} htmlFor="ot-reason" error={errors.reason && t(errors.reason)} required>
        <Input id="ot-reason" value={reason} maxLength={500} invalid={!!errors.reason} onChange={(e) => setReason(e.target.value)} />
      </Field>

      <section className="rounded-sm border border-line p-3 dark:border-night-line" aria-live="polite" data-testid="ot-preview">
        <h3 className="mb-2 text-sm font-semibold text-ink dark:text-night-ink">{t('otx.preview.title')}</h3>
        {previewError ? (
          <p role="alert" className="text-sm text-danger" data-testid="ot-preview-error">
            {t(previewError)}
          </p>
        ) : preview ? (
          <div className="flex flex-col gap-3">
            <OvertimeSplitList split={preview} totalMinutes={preview.minutes} data-testid="ot-preview-split" />
            <OvertimeCapLine label={t('otx.cap.day')} status={preview.day} warnPercent={preview.warnPercent} data-testid="ot-cap-day" />
            <OvertimeCapLine label={t('otx.cap.month')} status={preview.month} warnPercent={preview.warnPercent} data-testid="ot-cap-month" />
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t('otx.preview.hint')}</p>
        )}
      </section>

      {errors.form && (
        <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" data-testid="ot-form-error">
          {t(errors.form)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" loading={submitting} disabled={blocked || !!previewError} data-testid="ot-submit">
          {t('otx.submit')}
        </Button>
      </div>
    </form>
  );
}
