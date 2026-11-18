'use client';
import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Field, Input, Modal, Select, Textarea, type SelectOption } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { apiFieldErrors, type FormValues, type ParseResult } from '../forms';

export interface EntityFormField {
  name: string;
  label: string;
  /** `checkbox` values are 'true' / '' (form values are strings). */
  type?: 'text' | 'number' | 'date' | 'time' | 'select' | 'checkbox' | 'textarea';
  /** For `select`; an empty first option is added with `placeholder`. */
  options?: readonly SelectOption[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
  /** `step` for numeric inputs (e.g. "any" for coordinates). */
  step?: string;
  /** Visual group heading shown above this field. */
  section?: string;
}

export interface EntityFormDialogProps<T> {
  open: boolean;
  title: string;
  /** Prefix for input ids and the save button test id (`${testId}-save`). */
  testId: string;
  fields: readonly EntityFormField[];
  initial: FormValues;
  saving?: boolean;
  /** Validate the string values and build the payload; errors are translation keys per field. */
  parse(values: FormValues): ParseResult<T>;
  onSubmit(data: T): Promise<unknown>;
  onClose(): void;
}

/** Small modal form for editing one org item (branch geofence, department parent, position level, …). */
export function EntityFormDialog<T>(props: EntityFormDialogProps<T>) {
  // The body only mounts while open, so every opening starts from `initial` with no stale errors.
  return (
    <Modal open={props.open} title={props.title} onClose={props.onClose}>
      <EntityForm {...props} />
    </Modal>
  );
}

function EntityForm<T>({ testId, fields, initial, saving, parse, onSubmit, onClose }: EntityFormDialogProps<T>) {
  const t = useT();
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parse(values);
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    try {
      await onSubmit(parsed.data);
      onClose();
    } catch (err) {
      setErrors(apiFieldErrors(err));
    }
  };

  const id = (name: string) => `${testId}-${name}`;
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
      {errors.form ? <p role="alert" className="text-sm text-danger">{t(errors.form)}</p> : null}
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-3">
          {f.section && <h3 className="pt-1 text-sm font-semibold text-ink dark:text-night-ink">{f.section}</h3>}
          {f.type === 'checkbox' ? (
            <Checkbox
              id={id(f.name)}
              label={f.label}
              checked={values[f.name] === 'true'}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked ? 'true' : '' }))}
            />
          ) : (
            <Field label={f.label} htmlFor={id(f.name)} error={errors[f.name] ? t(errors[f.name]!) : undefined} hint={f.hint} required={f.required}>
              {f.type === 'select' ? (
                <Select
                  id={id(f.name)}
                  options={f.options ?? []}
                  placeholder={f.placeholder ?? '—'}
                  invalid={!!errors[f.name]}
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              ) : f.type === 'textarea' ? (
                <Textarea
                  id={id(f.name)}
                  invalid={!!errors[f.name]}
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              ) : (
                <Input
                  id={id(f.name)}
                  type={f.type === 'number' || f.type === 'date' || f.type === 'time' ? f.type : 'text'}
                  inputMode={f.type === 'number' ? 'decimal' : undefined}
                  step={f.step}
                  invalid={!!errors[f.name]}
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
            </Field>
          )}
        </div>
      ))}
      <div className="-mx-5 -mb-4 mt-2 flex justify-end gap-2 border-t border-line px-5 py-3 dark:border-night-line">
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" loading={saving} data-testid={`${testId}-save`}>{t('common.save')}</Button>
      </div>
    </form>
  );
}
