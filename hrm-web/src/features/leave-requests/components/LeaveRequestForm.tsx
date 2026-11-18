'use client';
import {
  HALF_DAYS,
  interpolate,
  leavePreviewInputOf,
  type HalfDay,
  type LeavePreview,
  type LeavePreviewInput,
  type LeaveRequestInput,
  type LeaveType,
  type StoredFileRef,
} from '@hrm/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Checkbox, Field, FileUpload, Input, Select, Textarea, type SelectOption } from '@/components/ui';
import { defaultEmployeeSelect, type RenderEmployeeSelect } from '@/features/attendance-requests/components/EmployeeSelect';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { useLeaveTypeName } from './LeaveViews';

export interface LeaveRequestFormProps {
  /** Active leave types (GET /leave/types). */
  types: readonly LeaveType[];
  /** HR (`leave.file_on_behalf`) or a manager: show the "file for" employee picker (the API checks the scope). */
  canFileForOthers?: boolean;
  renderEmployeeSelect?: RenderEmployeeSelect;
  /** Delegate candidates (GET /approvals/delegate-candidates), shown when the preview says a delegate is needed. */
  delegateOptions: readonly SelectOption[];
  /** Server preview: days, balance, eligibility, certificate, delegate (called while the user edits). */
  onPreview(input: LeavePreviewInput): Promise<LeavePreview>;
  /** Upload a certificate (POST /files?purpose=ATTACHMENT). */
  onUpload(file: File): Promise<StoredFileRef>;
  onSubmit(input: LeaveRequestInput): Promise<unknown>;
  onCancel?(): void;
  debounceMs?: number;
}

type FieldKey = 'leaveTypeId' | 'startDate' | 'endDate' | 'delegateUserId' | 'form';
const codeOf = (err: unknown) => (err instanceof ApiError ? err.code : 'unknown');

/**
 * Leave request (FR-LV-03): type, dates, full / half day, multiple birth (maternity), reason, certificate
 * (FR-LV-05), delegate (FR-ORG-03.2) and "file for" (FR-LV-10). Days, balance and every rule come from the API
 * preview (FR-LV-06); submit stays disabled while the preview reports an error.
 */
export function LeaveRequestForm({
  types,
  canFileForOthers,
  renderEmployeeSelect = defaultEmployeeSelect,
  delegateOptions,
  onPreview,
  onUpload,
  onSubmit,
  onCancel,
  debounceMs = 300,
}: LeaveRequestFormProps) {
  const t = useT();
  const typeName = useLeaveTypeName();
  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [halfDay, setHalfDay] = useState<HalfDay>('NONE');
  const [multipleBirth, setMultipleBirth] = useState(false);
  const [reason, setReason] = useState('');
  const [certificate, setCertificate] = useState<StoredFileRef | null>(null);
  const [delegateUserId, setDelegateUserId] = useState('');
  const [preview, setPreview] = useState<LeavePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const type = types.find((x) => x.id === leaveTypeId);
  const isMaternity = type?.category === 'MATERNITY';
  const input = leavePreviewInputOf({ employeeId, leaveTypeId, startDate, endDate, halfDay, multipleBirth: isMaternity && multipleBirth });
  const inputKey = JSON.stringify(input);

  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (!input) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      onPreview(input).then(
        (p) => !cancelled && setPreview(p),
        (err: unknown) => !cancelled && setPreviewError(codeOf(err)),
      );
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // onPreview is a stable API call; re-run only when the previewed input changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey, debounceMs]);

  const changeType = (id: string) => {
    setLeaveTypeId(id);
    const next = types.find((x) => x.id === id);
    if (!next?.allowHalfDay) setHalfDay('NONE');
    if (next?.category !== 'MATERNITY') setMultipleBirth(false);
  };

  const blocked = !!previewError || (!!preview && preview.errors.length > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!leaveTypeId) next.leaveTypeId = 'required';
    if (!startDate) next.startDate = 'required';
    if (!endDate) next.endDate = 'required';
    else if (startDate && endDate < startDate) next.endDate = 'leave_invalid_range';
    if (preview?.needsDelegate && !delegateUserId) next.delegateUserId = 'delegate_required';
    setErrors(next);
    if (Object.keys(next).length || blocked || !input) return;
    setSubmitting(true);
    try {
      await onSubmit({
        ...input,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(certificate ? { certificateFileId: certificate.id } : {}),
        ...(preview?.needsDelegate && delegateUserId ? { delegateUserId } : {}),
      });
    } catch (err) {
      setErrors({ form: codeOf(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4" data-testid="leave-form">
      {canFileForOthers && (
        <Field label={t('lvr.form.fileFor')} htmlFor="leave-employee" hint={t('lvr.form.self')}>
          {renderEmployeeSelect({ id: 'leave-employee', value: employeeId, onChange: setEmployeeId })}
        </Field>
      )}
      <Field label={t('lvr.form.type')} htmlFor="leave-type" error={errors.leaveTypeId && t(errors.leaveTypeId)} required>
        <Select
          id="leave-type"
          value={leaveTypeId}
          invalid={!!errors.leaveTypeId}
          placeholder={t('lvr.form.pickType')}
          options={types.filter((x) => x.isActive).map((x) => ({ value: x.id, label: typeName(x) }))}
          onChange={(e) => changeType(e.target.value)}
          data-testid="leave-type"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('lvr.form.startDate')} htmlFor="leave-start" error={errors.startDate && t(errors.startDate)} required>
          <Input
            id="leave-start"
            type="date"
            value={startDate}
            invalid={!!errors.startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
            }}
            data-testid="leave-start"
          />
        </Field>
        <Field label={t('lvr.form.endDate')} htmlFor="leave-end" error={errors.endDate && t(errors.endDate)} required>
          <Input id="leave-end" type="date" value={endDate} invalid={!!errors.endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="leave-end" />
        </Field>
      </div>
      {type?.allowHalfDay && (
        <Field label={t('lvr.form.halfDay')} htmlFor="leave-halfDay">
          <Select
            id="leave-halfDay"
            value={halfDay}
            options={HALF_DAYS.map((h) => ({ value: h, label: t(`leave.halfDay.${h}`) }))}
            onChange={(e) => setHalfDay(e.target.value as HalfDay)}
            data-testid="leave-halfDay"
          />
        </Field>
      )}
      {isMaternity && (
        <Checkbox id="leave-multipleBirth" label={t('lvr.form.multipleBirth')} checked={multipleBirth} onChange={(e) => setMultipleBirth(e.target.checked)} data-testid="leave-multipleBirth" />
      )}
      <Field label={t('lvr.form.reason')} htmlFor="leave-reason">
        <Textarea id="leave-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} data-testid="leave-reason" />
      </Field>
      {type?.requiresAttachment && (
        <Field label={t('lvr.form.certificate')} htmlFor="leave-certificate">
          <FileUpload
            id="leave-certificate"
            accept="application/pdf,image/jpeg,image/png"
            hint={certificate ? interpolate(t('lvr.form.certificateAttached'), { name: certificate.originalName }) : t('lvr.form.certificateHint')}
            onUpload={async (file) => setCertificate(await onUpload(file))}
            data-testid="leave-certificate"
          />
        </Field>
      )}
      {preview?.needsDelegate && (
        <Field label={t('lvr.form.delegate')} htmlFor="leave-delegate" hint={t('lvr.form.delegateHint')} error={errors.delegateUserId && t(errors.delegateUserId)} required>
          <Select
            id="leave-delegate"
            value={delegateUserId}
            invalid={!!errors.delegateUserId}
            placeholder={t('lvr.form.pickDelegate')}
            options={delegateOptions}
            onChange={(e) => setDelegateUserId(e.target.value)}
            data-testid="leave-delegate"
          />
        </Field>
      )}

      <LeavePreviewPanel preview={preview} error={previewError} />

      {errors.form && (
        <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" data-testid="leave-form-error">
          {t(errors.form)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" loading={submitting} disabled={blocked} data-testid="leave-submit">
          {t('lvr.form.submit')}
        </Button>
      </div>
    </form>
  );
}

/** What the API computed for the current input: days, balance or quota, errors, certificate deadline. */
export function LeavePreviewPanel({ preview, error }: { preview: LeavePreview | null; error: string | null }) {
  const t = useT();
  return (
    <section className="rounded-sm border border-line p-3 dark:border-night-line" aria-live="polite" data-testid="leave-preview">
      <h3 className="mb-2 text-sm font-semibold text-ink dark:text-night-ink">{t('lvr.preview.title')}</h3>
      {error ? (
        <p role="alert" className="text-sm text-danger" data-testid="leave-preview-error">
          {t(error)}
        </p>
      ) : preview ? (
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">{t('lvr.preview.days')}</dt>
            <dd className="font-semibold tabular-nums text-ink dark:text-night-ink" data-testid="leave-preview-days">
              {preview.days}
            </dd>
          </div>
          {Object.entries(preview.balanceByYear ?? {}).map(([year, balance]) => (
            <div key={year} className="flex justify-between">
              <dt className="text-ink-muted">{interpolate(t('lvr.preview.balance'), { year })}</dt>
              <dd className="tabular-nums text-ink dark:text-night-ink" data-testid={`leave-preview-balance-${year}`}>
                {balance}
              </dd>
            </div>
          ))}
          {preview.quota !== null && (
            <div className="flex justify-between">
              <dt className="text-ink-muted">{t('lvr.preview.quota')}</dt>
              <dd className="tabular-nums text-ink dark:text-night-ink" data-testid="leave-preview-quota">
                {preview.quota}
              </dd>
            </div>
          )}
          {preview.certificateRequired && preview.certificateDueDate && (
            <p className="text-warning" data-testid="leave-preview-certificate">
              {interpolate(t('lvr.preview.certificate'), { due: preview.certificateDueDate })}
            </p>
          )}
          {preview.needsDelegate && (
            <p className="text-warning" data-testid="leave-preview-delegate">
              {t('lvr.preview.needsDelegate')}
            </p>
          )}
          {preview.errors.map((code) => (
            <p key={code} role="alert" className="text-danger" data-testid="leave-preview-rule">
              {t(code)}
            </p>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-ink-muted">{t('lvr.preview.hint')}</p>
      )}
    </section>
  );
}
