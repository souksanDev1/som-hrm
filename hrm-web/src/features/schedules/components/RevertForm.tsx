'use client';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

export interface RevertFormProps {
  count: number;
  /** Default and earliest effective date (today in the workspace). */
  today: string;
  onSubmit(input: { effectiveFrom: string; reason: string }): Promise<unknown>;
  onCancel(): void;
}

/** Effective date + reason for "revert to standard" (FR-WS-03.4). */
export function RevertForm({ count, today, onSubmit, onCancel }: RevertFormProps) {
  const t = useT();
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'effectiveFrom' | 'reason' | 'form', string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!effectiveFrom) next.effectiveFrom = 'required';
    else if (effectiveFrom < today) next.effectiveFrom = 'effective_date_in_past';
    if (!reason.trim()) next.reason = 'required';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      await onSubmit({ effectiveFrom, reason: reason.trim() });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unknown';
      const field = err instanceof ApiError ? (err.details as { field?: string } | undefined)?.field : undefined;
      setErrors(field === 'effectiveFrom' ? { effectiveFrom: code } : { form: code });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4" data-testid="revert-form">
      <p className="text-sm text-ink dark:text-night-ink">{fill(t('schedule.overrides.selected'), { count })}</p>
      <Field label={t('schedule.effectiveFrom')} htmlFor="revert-effectiveFrom" error={errors.effectiveFrom && t(errors.effectiveFrom)} required>
        <Input
          id="revert-effectiveFrom"
          type="date"
          value={effectiveFrom}
          min={today}
          invalid={!!errors.effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
        />
      </Field>
      <Field label={t('schedule.reason')} htmlFor="revert-reason" error={errors.reason && t(errors.reason)} required>
        <Input id="revert-reason" value={reason} maxLength={500} invalid={!!errors.reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {errors.form && (
        <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(errors.form)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="danger" loading={submitting}>
          {t('schedule.overrides.revert')}
        </Button>
      </div>
    </form>
  );
}
