'use client';
import {
  GENDERS,
  LEAVE_COUNTING_METHODS,
  LEAVE_QUOTA_PERIODS,
  PAY_TYPES,
  type CreateLeaveTypeInput,
  type LeaveType,
  type LeaveTypeUpdateRequest,
  type PayType,
} from '@hrm/shared';
import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Field, Input, Select } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import {
  emptyLeaveTypeValues,
  leaveTypeFormValues,
  parseLeaveTypeForm,
  violationOf,
  type LeaveTypeFormErrors,
  type LeaveTypeFormValues,
} from '../form';
import { LegalMinimum } from './LegalMinimum';

export type LeaveTypeFormProps =
  | { mode: 'create'; type?: undefined; onSubmit(body: CreateLeaveTypeInput): Promise<unknown>; onCancel?(): void }
  | { mode: 'edit'; type: LeaveType; onSubmit(body: LeaveTypeUpdateRequest): Promise<unknown>; onCancel?(): void };

const POLICY_LABEL = { daysPerYear: 'lvp.types.days', hazardousDays: 'lvp.types.hazardousDays', multipleBirthDays: 'lvp.types.multipleBirthDays' } as const;

/**
 * Leave type editor (FR-LV-01) and custom type form (FR-LV-02). Statutory types show their legal minimum and keep
 * code / category / quota / counting / gender fixed; a value below the minimum is rejected by the API and shown on
 * the field it concerns.
 */
export function LeaveTypeForm(props: LeaveTypeFormProps) {
  const t = useT();
  const { mode, type } = props;
  const locked = mode === 'edit' && !type.isCustom;
  const [v, setV] = useState<LeaveTypeFormValues>(() => (type ? leaveTypeFormValues(type) : emptyLeaveTypeValues()));
  const [errors, setErrors] = useState<LeaveTypeFormErrors & { form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const set = <K extends keyof LeaveTypeFormValues>(key: K, value: LeaveTypeFormValues[K]) => setV((s) => ({ ...s, [key]: value }));
  const togglePayType = (p: PayType, on: boolean) =>
    set('minServicePayTypes', on ? [...v.minServicePayTypes, p] : v.minServicePayTypes.filter((x) => x !== p));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseLeaveTypeForm(v, mode);
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    setSubmitting(true);
    try {
      if (props.mode === 'create') await props.onSubmit(parsed.create);
      else
        await props.onSubmit(
          type?.isCustom ? { ...parsed.update, countingMethod: v.countingMethod, quotaPeriod: v.quotaPeriod, gender: v.gender || null } : parsed.update,
        );
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unknown';
      const violation = err instanceof ApiError && code === 'below_legal_minimum' ? violationOf(err.details) : null;
      setErrors(
        violation
          ? { [violation.field]: fill(t('lvp.types.belowLegalMin'), { field: t(POLICY_LABEL[violation.field]), legalMin: violation.legalMin }), form: code }
          : { form: code },
      );
    } finally {
      setSubmitting(false);
    }
  };

  const err = (f: keyof LeaveTypeFormErrors) => (errors[f] ? t(errors[f]) : undefined);
  const numberField = (f: 'daysPerYear' | 'hazardousDays' | 'multipleBirthDays' | 'minServiceDays', label: string, opts: { hint?: string; required?: boolean } = {}) => (
    <Field label={label} htmlFor={`lt-${f}`} error={err(f)} hint={opts.hint} required={opts.required}>
      <Input id={`lt-${f}`} inputMode="decimal" value={v[f]} invalid={!!errors[f]} onChange={(e) => set(f, e.target.value)} />
    </Field>
  );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4" data-testid="leave-type-form">
      {type && <LegalMinimum legalMin={type.legalMin} />}
      {locked && <p className="text-xs text-ink-muted" data-testid="leave-type-locked">{t('lvp.types.lockedHint')}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('lvp.types.code')} htmlFor="lt-code" error={err('code')} hint={mode === 'create' ? t('lvp.types.codeHint') : undefined} required={mode === 'create'}>
          <Input id="lt-code" value={v.code} disabled={mode === 'edit'} invalid={!!errors.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
        </Field>
        <Field label={t('lvp.types.category')} htmlFor="lt-category">
          <Input id="lt-category" value={t(`leave.category.${type?.category ?? 'OTHER'}`)} disabled />
        </Field>
        <Field label={t('lvp.types.nameLo')} htmlFor="lt-nameLo" error={err('nameLo')} required>
          <Input id="lt-nameLo" value={v.nameLo} maxLength={100} invalid={!!errors.nameLo} onChange={(e) => set('nameLo', e.target.value)} />
        </Field>
        <Field label={t('lvp.types.nameEn')} htmlFor="lt-nameEn" error={err('nameEn')} required>
          <Input id="lt-nameEn" value={v.nameEn} maxLength={100} invalid={!!errors.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
        </Field>
        <Field label={t('lvp.types.quota')} htmlFor="lt-quota">
          <Select
            id="lt-quota"
            value={v.quotaPeriod}
            disabled={locked}
            onChange={(e) => set('quotaPeriod', e.target.value as LeaveTypeFormValues['quotaPeriod'])}
            options={LEAVE_QUOTA_PERIODS.map((q) => ({ value: q, label: t(`leave.quota.${q}`) }))}
          />
        </Field>
        <Field label={t('lvp.types.counting')} htmlFor="lt-counting">
          <Select
            id="lt-counting"
            value={v.countingMethod}
            disabled={locked}
            onChange={(e) => set('countingMethod', e.target.value as LeaveTypeFormValues['countingMethod'])}
            options={LEAVE_COUNTING_METHODS.map((c) => ({ value: c, label: t(`leave.counting.${c}`) }))}
          />
        </Field>
        <Field label={t('lvp.types.gender')} htmlFor="lt-gender">
          <Select
            id="lt-gender"
            value={v.gender}
            disabled={locked}
            placeholder={t('lvp.types.genderAny')}
            onChange={(e) => set('gender', e.target.value as LeaveTypeFormValues['gender'])}
            options={GENDERS.map((g) => ({ value: g, label: t(`gender.${g}`) }))}
          />
        </Field>
        {numberField('daysPerYear', t('lvp.types.days'), { hint: t('lvp.types.daysHint'), required: true })}
        {numberField('hazardousDays', t('lvp.types.hazardousDays'), { hint: t('lvp.types.optionalHint') })}
        {numberField('multipleBirthDays', t('lvp.types.multipleBirthDays'), { hint: t('lvp.types.optionalHint') })}
        {numberField('minServiceDays', t('lvp.types.minServiceDays'), { required: true })}
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium text-ink dark:text-night-ink">{t('lvp.types.minServicePayTypes')}</legend>
        <div className="flex flex-wrap gap-4">
          {PAY_TYPES.map((p) => (
            <Checkbox key={p} id={`lt-pay-${p}`} label={t(`empx.payType.${p}`)} checked={v.minServicePayTypes.includes(p)} onChange={(e) => togglePayType(p, e.target.checked)} />
          ))}
        </div>
        <p className="text-xs text-ink-muted">{t('lvp.types.minServicePayTypesHint')}</p>
      </fieldset>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Checkbox id="lt-paid" label={t('lvp.types.paid')} checked={v.paid} onChange={(e) => set('paid', e.target.checked)} />
        <Checkbox id="lt-attachment" label={t('lvp.types.requiresAttachment')} checked={v.requiresAttachment} onChange={(e) => set('requiresAttachment', e.target.checked)} />
        <Checkbox id="lt-halfday" label={t('lvp.types.allowHalfDay')} checked={v.allowHalfDay} onChange={(e) => set('allowHalfDay', e.target.checked)} />
        <Checkbox id="lt-active" label={t('lvp.types.active')} checked={v.isActive} onChange={(e) => set('isActive', e.target.checked)} />
      </div>
      {errors.form && (
        <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" data-testid="leave-type-form-error">
          {t(errors.form)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {props.onCancel && (
          <Button variant="secondary" onClick={props.onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" loading={submitting} data-testid="leave-type-submit">
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
