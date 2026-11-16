'use client';
import { DAYS_PER_WEEK, validateWorkPattern, type WorkPatternLimits } from '@hrm/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, Field, Input } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { DAY_ORDER, formatHours, parseDayHours, PRESET_KEYS, presetPattern } from '../format';

export interface PatternFormInput {
  dayHours: number[];
  effectiveFrom: string;
  reason: string;
  label?: string;
}

export interface PatternFormProps {
  /** Prefix for input ids so several forms can live on one page. */
  idPrefix: string;
  initialDayHours: readonly number[];
  /** Limits in force today; the API re-checks against the limits of the effective date. */
  limits: WorkPatternLimits;
  /** Default and earliest effective date (today in the workspace). */
  today: string;
  /** Show the optional schedule name (individual schedules). */
  withLabel?: boolean;
  /** Extra fields rendered first (e.g. the employee picker). */
  children?: ReactNode;
  /** Blocks submit, e.g. while no employee is selected. */
  submitDisabled?: boolean;
  onSubmit(input: PatternFormInput): Promise<unknown>;
  onCancel?(): void;
}

type Errors = Partial<Record<'dayHours' | 'effectiveFrom' | 'reason' | 'form', string>>;

/** Maps an API error onto the field named in `details.field`. */
const apiErrors = (err: unknown): Errors => {
  if (!(err instanceof ApiError)) return { form: 'unknown' };
  const field = (err.details as { field?: string } | undefined)?.field;
  if (field === 'dayHours' || field === 'effectiveFrom') return { [field]: err.code };
  return { form: err.code };
};

/** Seven day-hour inputs + presets + effective date + reason. Used for the standard and for overrides. */
export function PatternForm({ idPrefix, initialDayHours, limits, today, withLabel, children, submitDisabled, onSubmit, onCancel }: PatternFormProps) {
  const t = useT();
  const [hours, setHours] = useState<string[]>(() => Array.from({ length: DAYS_PER_WEEK }, (_, d) => formatHours(initialDayHours[d] ?? 0)));
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [reason, setReason] = useState('');
  const [label, setLabel] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const id = (f: string) => `${idPrefix}-${f}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const dayHours = parseDayHours(hours);
    const next: Errors = {};
    // Early feedback only; the API validates again and is authoritative.
    const patternError = dayHours ? validateWorkPattern(dayHours, limits) : 'schedule_invalid_pattern';
    if (patternError) next.dayHours = patternError;
    if (!effectiveFrom) next.effectiveFrom = 'required';
    else if (effectiveFrom < today) next.effectiveFrom = 'effective_date_in_past';
    if (!reason.trim()) next.reason = 'required';
    setErrors(next);
    if (Object.keys(next).length || !dayHours) return;

    setSubmitting(true);
    try {
      await onSubmit({ dayHours, effectiveFrom, reason: reason.trim(), ...(withLabel && label.trim() ? { label: label.trim() } : {}) });
    } catch (err) {
      setErrors(apiErrors(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4" data-testid={`${idPrefix}-form`}>
      {children}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink dark:text-night-ink">
          {t('schedule.title')} <span className="text-danger">*</span>
        </legend>
        <div className="flex flex-wrap gap-1.5" aria-label={t('schedule.preset')}>
          {PRESET_KEYS.map((key) => (
            <Button key={key} size="sm" variant="secondary" onClick={() => setHours(presetPattern(key, limits).map(formatHours))}>
              {t(`schedule.preset.${key}`)}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {DAY_ORDER.map((d) => (
            <div key={d} className="flex flex-col gap-1">
              <label htmlFor={id(`day-${d}`)} className="truncate text-xs text-ink-muted">
                {t(`schedule.day.${d}`)}
              </label>
              <Input
                id={id(`day-${d}`)}
                type="number"
                inputMode="decimal"
                min={0}
                max={24}
                step={0.5}
                value={hours[d]}
                invalid={!!errors.dayHours}
                onChange={(e) => setHours((h) => h.map((v, i) => (i === d ? e.target.value : v)))}
              />
            </div>
          ))}
        </div>
        {errors.dayHours ? (
          <p role="alert" className="text-xs text-danger" data-testid={`${idPrefix}-pattern-error`}>
            {t(errors.dayHours)}
          </p>
        ) : (
          <p className="text-xs text-ink-muted">{fill(t('schedule.limits'), { day: limits.maxHoursPerDay, week: limits.maxHoursPerWeek })}</p>
        )}
      </fieldset>
      {withLabel && (
        <Field label={t('schedule.label')} htmlFor={id('label')}>
          <Input id={id('label')} value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      )}
      <Field label={t('schedule.effectiveFrom')} htmlFor={id('effectiveFrom')} error={errors.effectiveFrom && t(errors.effectiveFrom)} required>
        <Input
          id={id('effectiveFrom')}
          type="date"
          value={effectiveFrom}
          min={today}
          invalid={!!errors.effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
        />
      </Field>
      <Field label={t('schedule.reason')} htmlFor={id('reason')} error={errors.reason && t(errors.reason)} required>
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
        <Button type="submit" loading={submitting} disabled={submitDisabled}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
