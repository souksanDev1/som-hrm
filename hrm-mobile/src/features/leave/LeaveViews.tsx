import {
  interpolate as fill,
  HALF_DAYS,
  leavePreviewInputOf,
  type DelegateCandidate,
  type HalfDay,
  type LeaveBalance,
  type LeavePreview,
  type LeavePreviewInput,
  type LeaveRequest,
  type LeaveRequestInput,
  type LeaveType,
  type RequestStatus,
} from '@hrm/shared';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Segmented, TextField, type BadgeTone } from '@/components/ui';
import { SelfieCapture } from '@/features/checkin/CheckinViews';
import { errorCode } from '@/lib/api';
import { useT, usePrefsStore } from '@/lib/i18n';

export const LEAVE_STATUS_TONES: Record<RequestStatus, BadgeTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' };

export const useLeaveTypeName = () => {
  const locale = usePrefsStore((s) => s.locale);
  return (type: Pick<LeaveType, 'nameLo' | 'nameEn'>) => (locale === 'en' ? type.nameEn : type.nameLo);
};

const usePeriod = () => {
  const t = useT();
  return (r: Pick<LeaveRequest, 'startDate' | 'endDate' | 'halfDay'>) =>
    `${r.startDate === r.endDate ? r.startDate : `${r.startDate} – ${r.endDate}`}${r.halfDay !== 'NONE' ? ` · ${t(`leave.halfDay.${r.halfDay}`)}` : ''}`;
};

/** Single choice as wrapping chips (leave type, delegate). */
function Chips({ options, value, onChange, testIDPrefix }: { options: readonly { value: string; label: string; key: string }[]; value: string; onChange(v: string): void; testIDPrefix: string }) {
  return (
    <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            testID={`${testIDPrefix}-${o.key}`}
            className={`min-h-12 justify-center rounded-full border px-3 ${selected ? 'border-primary bg-primary-soft' : 'border-line bg-white dark:border-night-line dark:bg-night-surface'}`}
          >
            <Text className={selected ? 'text-primary' : 'text-ink dark:text-night-ink'}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Yearly balances (FR-LV-06.2): remaining days with entitled / used / pending, from the ledger. */
export function LeaveBalanceRows({ year, balances, types }: { year: number; balances: readonly LeaveBalance[]; types: readonly LeaveType[] }) {
  const t = useT();
  const typeName = useLeaveTypeName();
  return (
    <Card title={fill(t('lvr.balances.title'), { year })} testID="leave-balances">
      <View className="gap-2">
        {balances
          .filter((b) => b.quotaPeriod === 'YEARLY')
          .map((b) => {
            const type = types.find((x) => x.id === b.leaveTypeId);
            return (
              <View key={b.leaveTypeId} className="gap-0.5" testID={`leave-balance-${type?.code ?? b.leaveTypeId}`}>
                <View className="flex-row justify-between">
                  <Text className="text-sm font-medium text-ink dark:text-night-ink">{type ? typeName(type) : '—'}</Text>
                  <Text className="text-base font-semibold text-ink dark:text-night-ink">{String(b.balance)}</Text>
                </View>
                <Text className="text-xs text-ink-muted">
                  {`${t('lvr.balance.entitled')} ${b.entitled + b.carried + b.adjusted} · ${t('lvr.balance.used')} ${b.used} · ${t('lvr.balance.pending')} ${b.pending}`}
                </Text>
              </View>
            );
          })}
      </View>
    </Card>
  );
}

/** Own requests; a tap opens the detail. */
export function LeaveRequestRows({ items, onOpen }: { items: readonly LeaveRequest[]; onOpen(id: string): void }) {
  const t = useT();
  const typeName = useLeaveTypeName();
  const period = usePeriod();
  if (!items.length) {
    return (
      <Text className="py-8 text-center text-sm text-ink-muted" testID="leave-empty">
        {t('lvr.requests.empty')}
      </Text>
    );
  }
  return (
    <View className="gap-3">
      {items.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => onOpen(r.id)}
          testID={`leave-item-${r.id}`}
          className="gap-1 rounded-md border border-line bg-white p-4 dark:border-night-line dark:bg-night-surface"
        >
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-base font-semibold text-ink dark:text-night-ink">{typeName(r.leaveType)}</Text>
            <Badge tone={LEAVE_STATUS_TONES[r.status]} label={t(`approval.status.${r.status}`)} />
          </View>
          <Text className="text-sm text-ink-muted">{period(r)}</Text>
          <Text className="text-sm text-ink dark:text-night-ink">{fill(t('leave.days'), { days: r.days })}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** API preview of the current form (FR-LV-06): days, balance or quota, rule errors, certificate deadline. */
export function LeavePreviewBox({ data, error }: { data?: LeavePreview; error: unknown }) {
  const t = useT();
  const code = error ? errorCode(error) : null;
  return (
    <View className="gap-2 rounded-md border border-line p-3 dark:border-night-line" testID="leave-preview">
      <Text className="text-sm font-semibold text-ink dark:text-night-ink">{t('lvr.preview.title')}</Text>
      {code ? (
        <Text accessibilityRole="alert" className="text-sm text-danger" testID="leave-preview-error">
          {t(code)}
        </Text>
      ) : data ? (
        <>
          <View className="flex-row justify-between">
            <Text className="text-sm text-ink-muted">{t('lvr.preview.days')}</Text>
            <Text className="text-sm font-semibold text-ink dark:text-night-ink" testID="leave-preview-days">
              {String(data.days)}
            </Text>
          </View>
          {Object.entries(data.balanceByYear ?? {}).map(([year, balance]) => (
            <View key={year} className="flex-row justify-between">
              <Text className="text-sm text-ink-muted">{fill(t('lvr.preview.balance'), { year })}</Text>
              <Text className="text-sm text-ink dark:text-night-ink" testID={`leave-preview-balance-${year}`}>
                {String(balance)}
              </Text>
            </View>
          ))}
          {data.quota !== null ? (
            <View className="flex-row justify-between">
              <Text className="text-sm text-ink-muted">{t('lvr.preview.quota')}</Text>
              <Text className="text-sm text-ink dark:text-night-ink" testID="leave-preview-quota">
                {String(data.quota)}
              </Text>
            </View>
          ) : null}
          {data.certificateRequired && data.certificateDueDate ? (
            <Text className="text-sm text-warning" testID="leave-preview-certificate">
              {fill(t('lvr.preview.certificate'), { due: data.certificateDueDate })}
            </Text>
          ) : null}
          {data.errors.map((e) => (
            <Text key={e} accessibilityRole="alert" className="text-sm text-danger" testID="leave-preview-rule">
              {t(e)}
            </Text>
          ))}
        </>
      ) : (
        <Text className="text-sm text-ink-muted">{t('lvr.preview.hint')}</Text>
      )}
    </View>
  );
}

export interface LeaveRequestFormProps {
  types: readonly LeaveType[];
  delegates: readonly DelegateCandidate[];
  /** Preview of the current input (from `useLeavePreview`). */
  preview: { data?: LeavePreview; error: unknown };
  onInputChange(input: LeavePreviewInput | null): void;
  /** Upload a certificate photo; returns the file id. */
  onUploadPhoto(uri: string): Promise<string>;
  onSubmit(input: LeaveRequestInput): Promise<unknown>;
}

interface Values {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDay: HalfDay;
  multipleBirth: boolean;
}

/** Own leave request (FR-LV-03/05/06, FR-ORG-03.2): the API preview decides; submit is blocked on any rule error. */
export function LeaveRequestForm({ types, delegates, preview, onInputChange, onUploadPhoto, onSubmit }: LeaveRequestFormProps) {
  const t = useT();
  const typeName = useLeaveTypeName();
  const [values, setValues] = useState<Values>({ leaveTypeId: '', startDate: '', endDate: '', halfDay: 'NONE', multipleBirth: false });
  const [reason, setReason] = useState('');
  const [delegateUserId, setDelegateUserId] = useState('');
  const [certificateFileId, setCertificateFileId] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'leaveTypeId' | 'startDate' | 'endDate' | 'delegate' | 'certificate' | 'form', string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const type = types.find((x) => x.id === values.leaveTypeId);
  const set = (patch: Partial<Values>) => {
    const next = { ...values, ...patch };
    const nextType = types.find((x) => x.id === next.leaveTypeId);
    if (!nextType?.allowHalfDay) next.halfDay = 'NONE';
    if (nextType?.category !== 'MATERNITY') next.multipleBirth = false;
    setValues(next);
    onInputChange(leavePreviewInputOf(next));
  };
  const blocked = !!preview.error || (!!preview.data && preview.data.errors.length > 0);

  const upload = async (uri: string) => {
    setCamera(false);
    setUploading(true);
    setErrors((e) => ({ ...e, certificate: undefined }));
    try {
      setCertificateFileId(await onUploadPhoto(uri));
    } catch (err) {
      setErrors((e) => ({ ...e, certificate: errorCode(err) }));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const next: typeof errors = {};
    if (!values.leaveTypeId) next.leaveTypeId = 'required';
    const input = leavePreviewInputOf(values);
    if (!values.startDate) next.startDate = 'required';
    if (!values.endDate) next.endDate = 'required';
    else if (!input && values.leaveTypeId) next.endDate = 'invalid_date';
    if (preview.data?.needsDelegate && !delegateUserId) next.delegate = 'delegate_required';
    setErrors(next);
    if (Object.keys(next).length || blocked || !input) return;
    setSubmitting(true);
    try {
      await onSubmit({
        ...input,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(certificateFileId ? { certificateFileId } : {}),
        ...(preview.data?.needsDelegate ? { delegateUserId } : {}),
      });
    } catch (err) {
      setErrors({ form: errorCode(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="gap-4" testID="leave-form">
      <View className="gap-2">
        <Text className="text-sm font-medium text-ink dark:text-night-ink">{t('lvr.form.type')}</Text>
        <Chips
          options={types.filter((x) => x.isActive).map((x) => ({ value: x.id, label: typeName(x), key: x.code }))}
          value={values.leaveTypeId}
          onChange={(id) => set({ leaveTypeId: id })}
          testIDPrefix="leave-type"
        />
        {errors.leaveTypeId ? <Text className="text-sm text-danger">{t(errors.leaveTypeId)}</Text> : null}
      </View>
      <TextField
        label={t('lvr.form.startDate')}
        value={values.startDate}
        onChangeText={(v) => set({ startDate: v, ...(values.endDate && values.endDate >= v ? {} : { endDate: v }) })}
        placeholder="YYYY-MM-DD"
        error={errors.startDate && t(errors.startDate)}
        required
        testID="leave-start"
      />
      <TextField label={t('lvr.form.endDate')} value={values.endDate} onChangeText={(v) => set({ endDate: v })} placeholder="YYYY-MM-DD" error={errors.endDate && t(errors.endDate)} required testID="leave-end" />
      {type?.allowHalfDay ? (
        <Segmented value={values.halfDay} options={HALF_DAYS.map((h) => ({ value: h, label: t(`leave.halfDay.${h}`), testID: `leave-halfDay-${h}` }))} onChange={(h) => set({ halfDay: h })} />
      ) : null}
      {type?.category === 'MATERNITY' ? (
        <Segmented
          value={values.multipleBirth ? 'yes' : 'no'}
          options={[
            { value: 'no', label: t('common.no'), testID: 'leave-multipleBirth-no' },
            { value: 'yes', label: t('lvr.form.multipleBirth'), testID: 'leave-multipleBirth-yes' },
          ]}
          onChange={(v) => set({ multipleBirth: v === 'yes' })}
        />
      ) : null}
      <TextField label={t('lvr.form.reason')} value={reason} onChangeText={setReason} maxLength={500} testID="leave-reason" />
      {type?.requiresAttachment ? (
        <View className="gap-1">
          <Button title={t('lvr.form.certificatePhoto')} variant="secondary" loading={uploading} onPress={() => setCamera(true)} testID="leave-certificate-photo" />
          {certificateFileId ? (
            <Text className="text-sm text-success" testID="leave-certificate-ok">
              {t('lvr.detail.certificateAttached')}
            </Text>
          ) : null}
          {errors.certificate ? <Text className="text-sm text-danger">{t(errors.certificate)}</Text> : null}
        </View>
      ) : null}
      {preview.data?.needsDelegate ? (
        <View className="gap-2" testID="leave-delegate">
          <Text className="text-sm font-medium text-ink dark:text-night-ink">{t('lvr.form.delegate')}</Text>
          <Text className="text-xs text-ink-muted">{t('lvr.form.delegateHint')}</Text>
          <Chips options={delegates.map((d) => ({ value: d.userId, label: d.name, key: d.employeeCode ?? d.userId }))} value={delegateUserId} onChange={setDelegateUserId} testIDPrefix="leave-delegate" />
          {errors.delegate ? <Text className="text-sm text-danger">{t(errors.delegate)}</Text> : null}
        </View>
      ) : null}

      <LeavePreviewBox data={preview.data} error={preview.error} />

      {errors.form ? (
        <Text accessibilityRole="alert" className="text-sm text-danger" testID="leave-form-error">
          {t(errors.form)}
        </Text>
      ) : null}
      <Button title={t('lvr.form.submit')} onPress={() => void submit()} loading={submitting} disabled={blocked} testID="leave-submit" />
      <SelfieCapture visible={camera} facing="back" onCaptured={(uri) => void upload(uri)} onCancel={() => setCamera(false)} />
    </View>
  );
}

export interface LeaveDetailProps {
  request: LeaveRequest;
  onAttachPhoto(uri: string): Promise<unknown>;
  onCancel(reason: string): Promise<unknown>;
}

/** One request: status, period, certificate (photograph and attach while open), cancellation (FR-LV-05.3, FR-LV-12). */
export function LeaveDetail({ request: r, onAttachPhoto, onCancel }: LeaveDetailProps) {
  const t = useT();
  const typeName = useLeaveTypeName();
  const period = usePeriod();
  const [camera, setCamera] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const open = r.status === 'PENDING' || r.status === 'APPROVED';
  const cancelPending = r.cancelRequest?.status === 'PENDING';
  const reasonRequired = r.status === 'APPROVED';

  const run = async (fn: () => Promise<unknown>, done: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(done);
      return true;
    } catch (err) {
      setError(errorCode(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (reasonRequired && !reason.trim()) {
      setError('required');
      return;
    }
    if (await run(() => onCancel(reason.trim()), reasonRequired ? 'lvr.detail.cancelRequested' : null)) setCancelling(false);
  };

  return (
    <View className="gap-4" testID="leave-detail">
      <Card title={typeName(r.leaveType)} right={<Badge tone={LEAVE_STATUS_TONES[r.status]} label={t(`approval.status.${r.status}`)} testID="leave-detail-status" />}>
        <View className="gap-1">
          <Text className="text-sm text-ink dark:text-night-ink" testID="leave-detail-period">
            {period(r)}
          </Text>
          <Text className="text-sm text-ink dark:text-night-ink" testID="leave-detail-days">
            {fill(t('leave.days'), { days: r.days })}
          </Text>
          <Text className="text-xs text-ink-muted">{`${t(`leave.filedAs.${r.filedAs}`)}${r.submittedByName ? ` · ${r.submittedByName}` : ''}`}</Text>
          {r.reason ? <Text className="text-sm text-ink-muted">{r.reason}</Text> : null}
          {cancelPending ? (
            <Text className="text-sm text-warning" testID="leave-cancel-pending">
              {t('lvr.detail.cancelPending')}
            </Text>
          ) : null}
          {r.cancelledAt ? <Text className="text-sm text-ink-muted">{fill(t('lvr.detail.cancelledAt'), { date: r.cancelledAt.slice(0, 10) })}</Text> : null}
        </View>
      </Card>
      <Card title={t('lvr.detail.certificate')} testID="leave-detail-certificate">
        <Text className={`text-sm ${r.certificateFileId ? 'text-success' : r.certificateRequired ? 'text-warning' : 'text-ink-muted'}`} testID="leave-certificate-status">
          {r.certificateFileId
            ? t('lvr.detail.certificateAttached')
            : r.certificateRequired
              ? fill(t('lvr.detail.certificateMissing'), { due: r.certificateDueDate ?? '' })
              : t('lvr.detail.certificateNotNeeded')}
        </Text>
        {open && (r.certificateRequired || r.certificateFileId) ? (
          <Button title={t('lvr.detail.attach')} variant="secondary" onPress={() => setCamera(true)} loading={busy && !cancelling} className="mt-2" testID="leave-attach" />
        ) : null}
      </Card>
      {notice ? (
        <Text className="text-sm text-success" testID="leave-notice">
          {t(notice)}
        </Text>
      ) : null}
      {error && !cancelling ? (
        <Text accessibilityRole="alert" className="text-sm text-danger" testID="leave-error">
          {t(error)}
        </Text>
      ) : null}
      {open && !cancelPending && !cancelling ? <Button title={t('lvr.detail.cancel')} variant="danger" onPress={() => setCancelling(true)} testID="leave-cancel" /> : null}
      {cancelling ? (
        <View className="gap-3" testID="leave-cancel-form">
          {reasonRequired ? <Text className="text-sm text-ink-muted">{t('lvr.detail.cancelHint')}</Text> : null}
          <TextField label={t('lvr.detail.cancelReason')} value={reason} onChangeText={setReason} maxLength={500} required={reasonRequired} error={error ? t(error) : undefined} testID="leave-cancel-reason" />
          <Button title={t('lvr.detail.cancelConfirm')} variant="danger" loading={busy} onPress={() => void confirmCancel()} testID="leave-cancel-confirm" />
          <Button title={t('common.back')} variant="ghost" onPress={() => setCancelling(false)} testID="leave-cancel-back" />
        </View>
      ) : null}
      <SelfieCapture
        visible={camera}
        facing="back"
        onCaptured={(uri) => {
          setCamera(false);
          void run(() => onAttachPhoto(uri), 'lvr.detail.attached');
        }}
        onCancel={() => setCamera(false)}
      />
    </View>
  );
}
