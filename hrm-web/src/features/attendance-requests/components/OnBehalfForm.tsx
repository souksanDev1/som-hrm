'use client';
import { interpolate, type OnBehalfPunchInput, type ReviewPunch } from '@hrm/shared';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { defaultEmployeeSelect, type RenderEmployeeSelect } from './EmployeeSelect';

type FieldName = 'employeeId' | 'capturedAt' | 'reason' | 'form';

export interface OnBehalfFormProps {
  onSubmit(input: OnBehalfPunchInput): Promise<ReviewPunch>;
  renderEmployeeSelect?: RenderEmployeeSelect;
}

/** HR records a check-in/out for an employee (FR-ATT-04); the reason is mandatory and the API audits it. */
export function OnBehalfForm({ onSubmit, renderEmployeeSelect = defaultEmployeeSelect }: OnBehalfFormProps) {
  const t = useT();
  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState<OnBehalfPunchInput['kind']>('IN');
  const [capturedAt, setCapturedAt] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [saved, setSaved] = useState<ReviewPunch | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!employeeId) next.employeeId = 'required';
    if (!capturedAt) next.capturedAt = 'required';
    if (!reason.trim()) next.reason = 'required';
    setErrors(next);
    setSaved(null);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      setSaved(await onSubmit({ employeeId, kind, capturedAt: capturedAt.slice(0, 16), reason: reason.trim() }));
      setReason('');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unknown';
      const field = err instanceof ApiError ? (err.details as { field?: FieldName } | undefined)?.field : undefined;
      setErrors({ [field ?? 'form']: code });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4" data-testid="on-behalf-form">
      <Field label={t('attreq.onBehalf.employee')} htmlFor="ob-employee" error={errors.employeeId && t(errors.employeeId)} required>
        {renderEmployeeSelect({ id: 'ob-employee', value: employeeId, onChange: setEmployeeId, invalid: !!errors.employeeId })}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('attreq.onBehalf.kind')} htmlFor="ob-kind" required>
          <Select
            id="ob-kind"
            value={kind}
            options={(['IN', 'OUT'] as const).map((k) => ({ value: k, label: t(`attendance.kind.${k}`) }))}
            onChange={(e) => setKind(e.target.value as OnBehalfPunchInput['kind'])}
          />
        </Field>
        <Field label={t('attreq.onBehalf.capturedAt')} htmlFor="ob-at" error={errors.capturedAt && t(errors.capturedAt)} required>
          <Input id="ob-at" type="datetime-local" value={capturedAt} invalid={!!errors.capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
        </Field>
      </div>
      <Field label={t('attreq.onBehalf.reason')} htmlFor="ob-reason" error={errors.reason && t(errors.reason)} required>
        <Input id="ob-reason" value={reason} maxLength={500} invalid={!!errors.reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {errors.form && (
        <p role="alert" data-testid="on-behalf-error" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(errors.form)}
        </p>
      )}
      {saved && (
        <p data-testid="on-behalf-success" className="rounded-sm bg-success-soft px-3 py-2 text-sm text-success">
          {interpolate(t('attreq.onBehalf.success'), { employee: saved.employee.name, kind: t(`attendance.kind.${saved.kind}`), time: saved.capturedLocal })}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={submitting} data-testid="on-behalf-submit">
          {t('attreq.onBehalf.submit')}
        </Button>
      </div>
    </form>
  );
}
