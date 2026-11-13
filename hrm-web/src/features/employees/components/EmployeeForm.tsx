'use client';
import {
  createEmployeeSchema,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  NATIONALITY_TYPES,
  type CreateEmployeeInput,
} from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver } from 'react-hook-form';
import { Button, Card, Checkbox, Field, Input, Select } from '@/components/ui';
import { useBranches, useDepartments, usePositions } from '@/features/org/hooks';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

export type EmployeeFormValues = CreateEmployeeInput & { createLogin?: boolean; loginMethod?: 'PIN' | 'PASSWORD' };

export interface EmployeeFormProps {
  defaultValues?: Partial<EmployeeFormValues>;
  /** Hide login creation for edits. */
  mode: 'create' | 'edit';
  submitting?: boolean;
  error?: unknown;
  onSubmit(values: CreateEmployeeInput): void;
  onCancel(): void;
}

/** Empty strings from inputs become undefined so optional schema fields validate. */
const clean = (v: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(v).filter(([, val]) => val !== '' && val !== null && val !== undefined));

const resolver: Resolver<EmployeeFormValues> = async (values, ctx, opts) => {
  const { createLogin, loginMethod, ...rest } = values;
  const payload = { ...clean(rest), ...(createLogin ? { login: { method: loginMethod ?? 'PIN' } } : {}) };
  return zodResolver(createEmployeeSchema)(payload as never, ctx, opts as never) as never;
};

export function EmployeeForm({ defaultValues, mode, submitting, error, onSubmit, onCancel }: EmployeeFormProps) {
  const t = useT();
  const branches = useBranches();
  const departments = useDepartments();
  const positions = usePositions();
  const { register, handleSubmit, watch, formState } = useForm<EmployeeFormValues>({
    resolver,
    defaultValues: { nationalityType: 'LAO', status: 'PROBATION', employmentType: 'FULL_TIME', gender: 'MALE', loginMethod: 'PIN', ...defaultValues },
  });
  const errors = formState.errors as Partial<Record<string, { message?: string }>>;
  const e = (name: string) => (errors[name]?.message ? t(errors[name]!.message!) : undefined);
  const nationalityType = watch('nationalityType');
  const createLogin = watch('createLogin');
  const opts = (values: readonly string[], prefix: string) => values.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }));
  const refOpts = (rows?: { id: string; name: string }[]) => (rows ?? []).map((r) => ({ value: r.id, label: r.name }));

  const text = (name: keyof EmployeeFormValues, labelKey: string, props: Record<string, unknown> = {}) => (
    <Field label={t(labelKey)} htmlFor={name} error={e(name)} required={!!props.required}>
      <Input id={name} invalid={!!errors[name]} {...register(name)} {...props} required={undefined} />
    </Field>
  );

  return (
    <form
      noValidate
      data-testid="employee-form"
      onSubmit={handleSubmit((values) => {
        const { createLogin: cl, loginMethod, ...rest } = values;
        onSubmit({ ...(clean(rest) as CreateEmployeeInput), ...(cl && mode === 'create' ? { login: { method: loginMethod ?? 'PIN' } } : {}) });
      })}
      className="flex flex-col gap-4"
    >
      <Card title={t('nav.profile')}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {text('employeeCode', 'employee.code', { required: true })}
          {text('firstName', 'employee.firstName', { required: true })}
          {text('lastName', 'employee.lastName', { required: true })}
          {text('nickname', 'employee.nickname')}
          <Field label={t('employee.gender')} htmlFor="gender" required>
            <Select id="gender" options={opts(GENDERS, 'gender')} {...register('gender')} />
          </Field>
          {text('dateOfBirth', 'employee.dateOfBirth', { type: 'date' })}
          {text('phone', 'employee.phone', { inputMode: 'tel', placeholder: '020 XXXX XXXX' })}
          {text('email', 'employee.email', { type: 'email' })}
          {text('address', 'employee.address')}
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
          {text('familyBookNo', 'employee.familyBookNo')}
        </div>
      </Card>

      <Card title={t('employee.employmentType')}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {text('hireDate', 'employee.hireDate', { type: 'date', required: true })}
          <Field label={t('employee.employmentType')} htmlFor="employmentType" required>
            <Select id="employmentType" options={opts(EMPLOYMENT_TYPES, 'employmentType')} {...register('employmentType')} />
          </Field>
          <Field label={t('employee.status')} htmlFor="status">
            <Select id="status" options={opts(EMPLOYMENT_STATUSES, 'status')} {...register('status')} />
          </Field>
          <Field label={t('employee.branch')} htmlFor="branchId">
            <Select id="branchId" placeholder="—" options={refOpts(branches.data)} {...register('branchId')} />
          </Field>
          <Field label={t('employee.department')} htmlFor="departmentId">
            <Select id="departmentId" placeholder="—" options={refOpts(departments.data)} {...register('departmentId')} />
          </Field>
          <Field label={t('employee.position')} htmlFor="positionId">
            <Select id="positionId" placeholder="—" options={refOpts(positions.data)} {...register('positionId')} />
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
          {e('email') && <p className="mt-2 text-xs text-danger">{e('email')}</p>}
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
