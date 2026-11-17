'use client';
import { interpolate, type CreateOffsitePermissionInput, type OffsitePermission } from '@hrm/shared';
import { useState, type FormEvent } from 'react';
import { Badge, Button, ConfirmDialog, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { defaultEmployeeSelect, type RenderEmployeeSelect } from './EmployeeSelect';

type FieldName = 'employeeId' | 'fromDate' | 'toDate' | 'form';

export interface OffsiteFormProps {
  onSubmit(input: CreateOffsitePermissionInput): Promise<unknown>;
  onCancel(): void;
  renderEmployeeSelect?: RenderEmployeeSelect;
}

/** Grant an employee off-site check-in for a date range (FR-ATT-16.1). The API re-checks overlap and dates. */
export function OffsiteForm({ onSubmit, onCancel, renderEmployeeSelect = defaultEmployeeSelect }: OffsiteFormProps) {
  const t = useT();
  const [employeeId, setEmployeeId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!employeeId) next.employeeId = 'required';
    if (!fromDate) next.fromDate = 'required';
    if (!toDate) next.toDate = 'required';
    else if (fromDate && toDate < fromDate) next.toDate = 'end_before_start';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      await onSubmit({ employeeId, fromDate, toDate, note: note.trim() || undefined });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unknown';
      const field = err instanceof ApiError ? (err.details as { field?: FieldName } | undefined)?.field : undefined;
      setErrors({ [field ?? 'form']: code });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4" data-testid="offsite-form">
      <Field label={t('attreq.offsite.employee')} htmlFor="offsite-employee" error={errors.employeeId && t(errors.employeeId)} required>
        {renderEmployeeSelect({ id: 'offsite-employee', value: employeeId, onChange: setEmployeeId, invalid: !!errors.employeeId })}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('attreq.offsite.fromDate')} htmlFor="offsite-from" error={errors.fromDate && t(errors.fromDate)} required>
          <Input id="offsite-from" type="date" value={fromDate} invalid={!!errors.fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label={t('attreq.offsite.toDate')} htmlFor="offsite-to" error={errors.toDate && t(errors.toDate)} required>
          <Input id="offsite-to" type="date" value={toDate} min={fromDate || undefined} invalid={!!errors.toDate} onChange={(e) => setToDate(e.target.value)} />
        </Field>
      </div>
      <Field label={t('attreq.offsite.note')} htmlFor="offsite-note">
        <Input id="offsite-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {errors.form && (
        <p role="alert" data-testid="offsite-error" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(errors.form)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={submitting} data-testid="offsite-save">
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

export interface OffsiteListProps {
  items: readonly OffsitePermission[];
  onRevoke(id: string): Promise<unknown>;
}

/** Permissions with their range and state; active ones can be revoked after a confirmation. */
export function OffsiteList({ items, onRevoke }: OffsiteListProps) {
  const t = useT();
  const [pending, setPending] = useState<OffsitePermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await onRevoke(pending.id);
      setPending(null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'unknown');
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && (
        <p role="alert" data-testid="offsite-revoke-error" className="mb-2 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(error)}
        </p>
      )}
      <ul data-testid="offsite-list" className="divide-y divide-line dark:divide-night-line">
        {items.map((p) => (
          <li key={p.id} data-testid="offsite-item" className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium text-ink dark:text-night-ink">
                {p.employee.employeeCode} · {p.employee.name}
              </p>
              <p className="text-sm text-ink-muted" data-testid="offsite-range">
                {p.fromDate} – {p.toDate}
                {p.note ? ` · ${p.note}` : ''}
              </p>
              {p.grantedBy && (
                <p className="text-xs text-ink-muted">
                  {t('attreq.offsite.grantedBy')}: {p.grantedBy}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={p.active ? 'success' : 'neutral'}>{t(p.active ? 'attreq.offsite.active' : 'attreq.offsite.inactive')}</Badge>
              {!p.revokedAt && (
                <Button size="sm" variant="secondary" onClick={() => setPending(p)} data-testid="offsite-revoke">
                  {t('attreq.offsite.revoke')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!pending}
        title={t('attreq.offsite.revoke')}
        message={pending ? interpolate(t('attreq.offsite.revokeConfirm'), { employee: pending.employee.name }) : ''}
        confirmLabel={t('attreq.offsite.revoke')}
        tone="danger"
        loading={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
