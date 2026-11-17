'use client';
import type { CreateDelegationInput, DelegateCandidate, Delegation } from '@hrm/shared';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

type FieldName = 'delegatorUserId' | 'delegateUserId' | 'startDate' | 'endDate' | 'form';

export interface DelegationFormProps {
  candidates: readonly DelegateCandidate[];
  /** Today in the workspace; the default start and the earliest end. */
  today: string;
  /** Editing keeps the delegator; creating with `canPickDelegator` lets HR choose another manager. */
  initial?: Delegation;
  canPickDelegator?: boolean;
  onSubmit(input: CreateDelegationInput): Promise<unknown>;
  onCancel(): void;
}

/** Appoint or edit a delegate for a date range (FR-ORG-03.1). The API re-checks every rule. */
export function DelegationForm({ candidates, today, initial, canPickDelegator = false, onSubmit, onCancel }: DelegationFormProps) {
  const t = useT();
  const [delegatorUserId, setDelegatorUserId] = useState('');
  const [delegateUserId, setDelegateUserId] = useState(initial?.delegate.userId ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? today);
  const [endDate, setEndDate] = useState(initial?.endDate ?? today);
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const option = (c: DelegateCandidate) => ({ value: c.userId, label: c.employeeCode ? `${c.name} · ${c.employeeCode}` : c.name });
  const showDelegator = canPickDelegator && !initial;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!delegateUserId) next.delegateUserId = 'required';
    else if (delegatorUserId && delegateUserId === delegatorUserId) next.delegateUserId = 'delegation_self';
    if (!startDate) next.startDate = 'required';
    if (!endDate) next.endDate = 'required';
    else if (startDate && endDate < startDate) next.endDate = 'end_before_start';
    else if (endDate < today) next.endDate = 'delegation_in_past';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      await onSubmit({ delegateUserId, startDate, endDate, reason: reason.trim() || undefined, ...(delegatorUserId ? { delegatorUserId } : {}) });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unknown';
      const field = err instanceof ApiError ? (err.details as { field?: FieldName } | undefined)?.field : undefined;
      setErrors({ [field ?? 'form']: code });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4" data-testid="delegation-form">
      {showDelegator && (
        <Field label={t('delegation.delegator')} htmlFor="delegation-delegator" error={errors.delegatorUserId && t(errors.delegatorUserId)}>
          <Select
            id="delegation-delegator"
            value={delegatorUserId}
            placeholder={t('delegation.me')}
            options={candidates.filter((c) => c.isManager).map(option)}
            onChange={(e) => setDelegatorUserId(e.target.value)}
          />
        </Field>
      )}
      <Field label={t('delegation.delegate')} htmlFor="delegation-delegate" error={errors.delegateUserId && t(errors.delegateUserId)} required>
        <Select
          id="delegation-delegate"
          value={delegateUserId}
          placeholder={t('delegation.pick')}
          options={candidates.map(option)}
          invalid={!!errors.delegateUserId}
          onChange={(e) => setDelegateUserId(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('delegation.startDate')} htmlFor="delegation-start" error={errors.startDate && t(errors.startDate)} required>
          <Input id="delegation-start" type="date" value={startDate} invalid={!!errors.startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label={t('delegation.endDate')} htmlFor="delegation-end" error={errors.endDate && t(errors.endDate)} required>
          <Input id="delegation-end" type="date" value={endDate} min={startDate || today} invalid={!!errors.endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      <Field label={t('delegation.reason')} htmlFor="delegation-reason">
        <Input id="delegation-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {errors.form && (
        <p role="alert" data-testid="delegation-error" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(errors.form)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={submitting} data-testid="delegation-save">
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
