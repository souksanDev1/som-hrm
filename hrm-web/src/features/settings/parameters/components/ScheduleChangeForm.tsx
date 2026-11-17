'use client';
import { validateParameterValue, type ParameterValueInput, type ParameterView } from '@hrm/shared';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { fill, parseParameterInput, valueToInput } from '../format';

export interface ScheduleChangeInput {
  value: ParameterValueInput;
  /** YYYY-MM-DD (`date` mode) or an ISO date-time (`datetime` mode). */
  effectiveFrom: string;
  reason: string;
}

export interface ScheduleChangeFormProps {
  parameter: ParameterView;
  /** Workspace parameters take a calendar date; system parameters an instant. */
  dateMode?: 'date' | 'datetime';
  /** Initial effective date: YYYY-MM-DD or a datetime-local string. */
  defaultEffectiveFrom: string;
  /** Earliest selectable date (same format as `defaultEffectiveFrom`). */
  minEffectiveFrom?: string;
  onSubmit(input: ScheduleChangeInput): Promise<unknown>;
  onCancel?(): void;
}

type FieldName = 'value' | 'effectiveFrom' | 'reason';
type Errors = Partial<Record<FieldName | 'form', string>>;

/** Maps an API error onto the field it concerns (API sends `details.field`). */
const apiErrors = (err: unknown): Errors => {
  if (!(err instanceof ApiError)) return { form: 'unknown' };
  const field = (err.details as { field?: string } | undefined)?.field;
  if (field === 'value' || field === 'effectiveFrom' || field === 'key') return { [field === 'key' ? 'value' : field]: err.code };
  if (err.code === 'validation_error' && Array.isArray(err.details)) {
    const first = (err.details as { path?: string }[])[0]?.path;
    if (first === 'value' || first === 'effectiveFrom' || first === 'reason') return { [first]: 'invalid_type' };
  }
  return { form: err.code };
};

/** datetime-local → ISO. The untouched default means "now" (it may be a few minutes old by the time the form is sent). */
const toInstant = (local: string, defaultLocal: string) => (local === defaultLocal ? new Date() : new Date(local)).toISOString();

/** Value + effective date + reason form used for workspace and system parameters (FR-WS-08.2/08.5). */
export function ScheduleChangeForm({ parameter, dateMode = 'date', defaultEffectiveFrom, minEffectiveFrom, onSubmit, onCancel }: ScheduleChangeFormProps) {
  const t = useT();
  const [value, setValue] = useState(valueToInput(parameter.currentValue, parameter.unit));
  const [effectiveFrom, setEffectiveFrom] = useState(defaultEffectiveFrom);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const id = (f: FieldName) => `param-${f}`;

  const hint =
    parameter.type === 'intList'
      ? fill(t('param.listHint'), { max: parameter.maxItems ?? '' })
      : parameter.unit === 'timeOfDay'
        ? 'HH:mm'
        : parameter.type === 'int'
        ? [
            fill(t('param.range'), { min: parameter.min ?? '', max: parameter.max ?? '' }),
            parameter.legalMin !== null ? fill(t('param.legalMin'), { min: parameter.legalMin }) : null,
            parameter.legalMax !== null ? fill(t('param.legalMax'), { max: parameter.legalMax }) : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseParameterInput(parameter.type, value, parameter.unit);
    const next: Errors = {};
    if (parsed === null) next.value = 'invalid_type';
    else {
      // Early feedback only — the API validates again and is authoritative.
      const code = validateParameterValue(parameter.key, parsed);
      if (code) next.value = code;
    }
    if (!effectiveFrom) next.effectiveFrom = 'required';
    if (!reason.trim()) next.reason = 'required';
    setErrors(next);
    if (Object.keys(next).length || parsed === null) return;

    setSubmitting(true);
    try {
      await onSubmit({
        value: parsed,
        effectiveFrom: dateMode === 'datetime' ? toInstant(effectiveFrom, defaultEffectiveFrom) : effectiveFrom,
        reason: reason.trim(),
      });
    } catch (err) {
      setErrors(apiErrors(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4" data-testid="schedule-change-form">
      <Field label={t('param.value')} htmlFor={id('value')} error={errors.value && t(errors.value)} hint={hint} required>
        {parameter.type === 'boolean' ? (
          <Select
            id={id('value')}
            value={value}
            invalid={!!errors.value}
            onChange={(e) => setValue(e.target.value)}
            options={[
              { value: 'true', label: t('param.enabled') },
              { value: 'false', label: t('param.disabled') },
            ]}
          />
        ) : (
          <Input
            id={id('value')}
            value={value}
            inputMode={parameter.type === 'int' && parameter.unit !== 'timeOfDay' ? 'numeric' : 'text'}
            invalid={!!errors.value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </Field>
      <Field label={t('param.effectiveFrom')} htmlFor={id('effectiveFrom')} error={errors.effectiveFrom && t(errors.effectiveFrom)} required>
        <Input
          id={id('effectiveFrom')}
          type={dateMode === 'datetime' ? 'datetime-local' : 'date'}
          value={effectiveFrom}
          min={minEffectiveFrom}
          invalid={!!errors.effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
        />
      </Field>
      <Field label={t('param.reason')} htmlFor={id('reason')} error={errors.reason && t(errors.reason)} required>
        <Input id={id('reason')} value={reason} maxLength={500} invalid={!!errors.reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {errors.form && (
        <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(errors.form)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
