'use client';
import {
  CONTRACT_TYPES,
  createEmployeeSchema,
  EMPLOYMENT_STATUSES,
  GENDERS,
  LAO_PROVINCES,
  NATIONALITY_TYPES,
  PAY_TYPES,
  updateEmployeeSchema,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { Button, Card, Checkbox, Field, Input, Select } from '@/components/ui';
import { useBranches, useDepartments, usePositions } from '@/features/org/hooks';
import { ApiError } from '@/lib/api-client';
import { usePrefsStore, useT } from '@/lib/i18n';
import { useManagerOptions } from '../hooks';
import { toCreatePayload, toUpdateFields, toUpdatePayload, type EmployeeFormValues } from '../payload';

export type { EmployeeFormValues } from '../payload';

interface EmployeeFormBaseProps {
  defaultValues?: Partial<EmployeeFormValues>;
  /** The stored manager, so the picker can show it even when it is not among the loaded options. */
  currentManager?: { id: string; name: string } | null;
  submitting?: boolean;
  error?: unknown;
  onCancel(): void;
}

export type EmployeeFormProps = EmployeeFormBaseProps &
  (
    | { mode: 'create'; onSubmit(payload: CreateEmployeeInput): void }
    /** Edit sends only changed fields; cleared optional fields are sent as `null`. */
    | { mode: 'edit'; onSubmit(payload: UpdateEmployeeInput): void }
  );

/** Validate exactly what will be sent: the create body, or every field as PATCH sees it. */
const resolverFor = (mode: 'create' | 'edit'): Resolver<EmployeeFormValues> => async (values, ctx, opts) =>
  mode === 'create'
    ? (zodResolver(createEmployeeSchema)(toCreatePayload(values) as never, ctx, opts as never) as never)
    : (zodResolver(updateEmployeeSchema)(toUpdateFields(values) as never, ctx, opts as never) as never);

const FORM_DEFAULTS: Partial<EmployeeFormValues> = {
  nationalityType: 'LAO',
  status: 'PROBATION',
  contractType: 'PROBATION',
  payType: 'MONTHLY',
  gender: 'MALE',
  loginMethod: 'PIN',
  hazardousWork: false,
};

export function EmployeeForm(props: EmployeeFormProps) {
  const { defaultValues, currentManager, mode, submitting, error, onCancel } = props;
  const t = useT();
  const branches = useBranches();
  const departments = useDepartments();
  const positions = usePositions();
  const managers = useManagerOptions();
  const locale = usePrefsStore((s) => s.locale);
  const initial = useMemo(() => ({ ...FORM_DEFAULTS, ...defaultValues }) as EmployeeFormValues, [defaultValues]);
  const resolver = useMemo(() => resolverFor(mode), [mode]);
  const { register, handleSubmit, watch, formState } = useForm<EmployeeFormValues>({ resolver, defaultValues: initial });
  const errors = formState.errors as Partial<Record<string, { message?: string }>>;
  const e = (name: string) => (errors[name]?.message ? t(errors[name]!.message!) : undefined);
  const nationalityType = watch('nationalityType');
  const createLogin = watch('createLogin');
  const status = watch('status');
  const contractType = watch('contractType');
  const opts = (values: readonly string[], prefix: string) => values.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }));
  const refOpts = (rows?: { id: string; name: string }[]) => (rows ?? []).map((r) => ({ value: r.id, label: r.name }));
  const managerOptions = useMemo(() => {
    const loaded = managers.data ?? [];
    return currentManager && !loaded.some((o) => o.value === currentManager.id)
      ? [{ value: currentManager.id, label: currentManager.name }, ...loaded]
      : loaded;
  }, [managers.data, currentManager]);

  const text = (name: keyof EmployeeFormValues, labelKey: string, extra: Record<string, unknown> = {}) => {
    const { required, hint, ...inputProps } = extra;
    return (
      <Field label={t(labelKey)} htmlFor={name} error={e(name)} required={!!required} hint={hint as string | undefined}>
        <Input id={name} invalid={!!errors[name]} {...register(name)} {...inputProps} />
      </Field>
    );
  };

  return (
    <form
      noValidate
      data-testid="employee-form"
      onSubmit={handleSubmit((values) => {
        if (props.mode === 'create') props.onSubmit(toCreatePayload(values));
        else props.onSubmit(toUpdatePayload(values, initial));
      })}
      className="flex flex-col gap-4"
    >
      <Card title={t('nav.profile')}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {text('employeeCode', 'employee.code', { required: true })}
          {text('firstName', 'employee.firstName', { required: true })}
          {text('lastName', 'employee.lastName', { required: true })}
          {text('firstNameEn', 'empx.firstNameEn', { lang: 'en' })}
          {text('lastNameEn', 'empx.lastNameEn', { lang: 'en' })}
          {text('nickname', 'employee.nickname')}
          <Field label={t('employee.gender')} htmlFor="gender" required>
            <Select id="gender" options={opts(GENDERS, 'gender')} {...register('gender')} />
          </Field>
          {text('dateOfBirth', 'employee.dateOfBirth', { type: 'date' })}
          {text('phone', 'employee.phone', { inputMode: 'tel', placeholder: '020 XXXX XXXX' })}
          {text('email', 'employee.email', { type: 'email' })}
        </div>
      </Card>

      <Card title={t('empx.address.title')}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {text('village', 'empx.address.village')}
          {text('district', 'empx.address.district')}
          <Field label={t('empx.address.province')} htmlFor="province" error={e('province')}>
            <Select
              id="province"
              placeholder="—"
              options={LAO_PROVINCES.map((p) => ({ value: p.code, label: p[locale] }))}
              {...register('province')}
            />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">{text('address', 'empx.address.detail')}</div>
        </div>
      </Card>

      <Card title={`${t('employee.nationalityType')} · ${t('employee.socialSecurityNo')}`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('employee.nationalityType')} htmlFor="nationalityType" required>
            <Select id="nationalityType" options={opts(NATIONALITY_TYPES, 'nationality')} {...register('nationalityType')} />
          </Field>
          {nationalityType === 'FOREIGN' && text('nationality', 'employee.nationality', { required: true })}
          {text('idCardNo', 'employee.idCardNo')}
          {text('socialSecurityNo', 'employee.socialSecurityNo')}
          {text('ssnRegisteredAt', 'empx.ssnRegisteredAt', { type: 'date' })}
          {text('familyBookNo', 'employee.familyBookNo')}
          {text('familyBookHolder', 'empx.familyBookHolder')}
        </div>
      </Card>

      <Card title={t('employee.employmentType')}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {text('hireDate', 'employee.hireDate', { type: 'date', required: true })}
          <Field label={t('empx.contractType')} htmlFor="contractType" required>
            <Select id="contractType" options={opts(CONTRACT_TYPES, 'empx.contractType')} {...register('contractType')} />
          </Field>
          {contractType === 'FIXED_TERM' && text('contractEndDate', 'empx.contractEndDate', { type: 'date' })}
          {contractType === 'PROBATION' && text('probationEndDate', 'empx.probationEndDate', { type: 'date' })}
          <Field label={t('empx.payType')} htmlFor="payType" required>
            <Select id="payType" options={opts(PAY_TYPES, 'empx.payType')} {...register('payType')} />
          </Field>
          <Field
            label={t('employee.status')}
            htmlFor="status"
            hint={mode === 'edit' && (status === 'RESIGNED' || status === 'TERMINATED') ? t('empx.status.loginDisabledHint') : undefined}
          >
            <Select id="status" options={opts(EMPLOYMENT_STATUSES, 'status')} {...register('status')} />
          </Field>
          {mode === 'edit' && text('effectiveDate', 'empx.effectiveDate', { type: 'date', hint: t('empx.effectiveDate.hint') })}
          <Field label={t('employee.branch')} htmlFor="branchId">
            <Select id="branchId" placeholder="—" options={refOpts(branches.data)} {...register('branchId')} />
          </Field>
          <Field label={t('employee.department')} htmlFor="departmentId">
            <Select id="departmentId" placeholder="—" options={refOpts(departments.data)} {...register('departmentId')} />
          </Field>
          <Field label={t('employee.position')} htmlFor="positionId">
            <Select id="positionId" placeholder="—" options={refOpts(positions.data)} {...register('positionId')} />
          </Field>
          <Field label={t('employee.manager')} htmlFor="managerId" error={e('managerId')}>
            <Select id="managerId" placeholder="—" options={managerOptions} {...register('managerId')} />
          </Field>
        </div>
        <div className="mt-4">
          <Checkbox id="hazardousWork" label={t('employee.hazardousWork')} {...register('hazardousWork')} />
        </div>
      </Card>

      {mode === 'create' && (
        <Card title={t('employee.createLogin')}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Checkbox id="createLogin" label={t('employee.createLogin')} {...register('createLogin')} />
            {createLogin && (
              <Select
                id="loginMethod"
                aria-label="login method"
                className="sm:w-60"
                options={[
                  { value: 'PIN', label: t('auth.usePin') },
                  { value: 'PASSWORD', label: t('auth.usePassword') },
                ]}
                {...register('loginMethod')}
              />
            )}
          </div>
          {createLogin && <p className="mt-2 text-xs text-ink-muted">{t('empx.credential.identifierHint')}</p>}
        </Card>
      )}

      {error ? (
        <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(error instanceof ApiError ? error.code : 'unknown')}
        </p>
      ) : null}

      <div className="sticky bottom-16 flex justify-end gap-2 rounded-md bg-canvas/90 py-2 backdrop-blur dark:bg-night-canvas/90 lg:bottom-0">
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={submitting} data-testid="employee-submit">
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
