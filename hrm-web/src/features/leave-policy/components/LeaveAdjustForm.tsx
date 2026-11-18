'use client';
import type { LeaveAdjustInput, LeaveType } from '@hrm/shared';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { useLeaveTypeName } from '../hooks';

export interface LeaveAdjustFormProps {
  employeeId: string;
  year: number;
  types: readonly LeaveType[];
  onSubmit(body: LeaveAdjustInput): Promise<unknown>;
}

type Errors = Partial<Record<'leaveTypeId' | 'days' | 'reason' | 'form', string>>;

/** HR adjustment of a balance (+/- days) with a mandatory reason (FR-LV-07.2); posted as an ADJUST ledger row. */
export function LeaveAdjustForm({ employeeId, year, types, onSubmit }: LeaveAdjustFormProps) {
  const t = useT();
  const name = useLeaveTypeName();
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(days.trim());
    const next: Errors = {};
    if (!leaveTypeId) next.leaveTypeId = 'required';
    if (!days.trim() || !Number.isFinite(n)) next.days = 'required';
    else if (n === 0 || !Number.isInteger(n * 2)) next.days = 'leave_days_half_step';
    if (!reason.trim()) next.reason = 'required';
    setErrors(next);
    setDone(false);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      await onSubmit({ employeeId, leaveTypeId, periodYear: year, days: n, reason: reason.trim() });
      setDays('');
      setReason('');
      setDone(true);
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.code : 'unknown' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3" data-testid="leave-adjust-form">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={t('lvp.ledger.type')} htmlFor="adj-type" error={errors.leaveTypeId && t(errors.leaveTypeId)} required>
          <Select
            id="adj-type"
            value={leaveTypeId}
            invalid={!!errors.leaveTypeId}
            placeholder=""
            onChange={(e) => setLeaveTypeId(e.target.value)}
            options={types.map((x) => ({ value: x.id, label: name(x) }))}
          />
        </Field>
        <Field label={t('lvp.ledger.adjustDays')} htmlFor="adj-days" error={errors.days && t(errors.days)} hint={t('lvp.ledger.adjustDaysHint')} required>
          <Input id="adj-days" inputMode="decimal" value={days} invalid={!!errors.days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Field label={t('lvp.ledger.adjustReason')} htmlFor="adj-reason" error={errors.reason && t(errors.reason)} required>
          <Input id="adj-reason" value={reason} maxLength={500} invalid={!!errors.reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      {errors.form && (
        <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" data-testid="leave-adjust-error">
          {t(errors.form)}
        </p>
      )}
      {done && (
        <p className="text-sm text-success" data-testid="leave-adjust-done">
          {t('lvp.ledger.adjustDone')}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={submitting} data-testid="leave-adjust-submit">
          {t('lvp.ledger.adjustSubmit')}
        </Button>
      </div>
    </form>
  );
}
