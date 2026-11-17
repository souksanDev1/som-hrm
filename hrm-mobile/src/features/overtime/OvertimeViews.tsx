import {
  interpolate as fill,
  formatDurationMinutes,
  isValidIsoDate,
  OVERTIME_CATEGORIES,
  OVERTIME_KINDS,
  overtimeCategoryKey,
  type OvertimeInput,
  type OvertimePreview,
  type OvertimePreviewInput,
  type OvertimeRequestView,
  type RequestStatus,
} from '@hrm/shared';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Segmented, TextField, type BadgeTone } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useT } from '@/lib/i18n';

const TIME_RE = /^\d{2}:\d{2}$/;
const STATUS_TONES: Record<RequestStatus, BadgeTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' };

type Split = Record<(typeof OVERTIME_CATEGORIES)[number], number>;

/** The four OT categories and the total in h:mm (FR-ATT-21). */
export function OvertimeSplitRows({ split, totalMinutes, testID }: { split: Split; totalMinutes: number; testID?: string }) {
  const t = useT();
  return (
    <View className="gap-1" testID={testID}>
      {OVERTIME_CATEGORIES.map((c) => (
        <View key={c} className="flex-row justify-between">
          <Text className="text-sm text-ink-muted">{t(overtimeCategoryKey(c))}</Text>
          <Text className="text-sm text-ink dark:text-night-ink" testID={testID ? `${testID}-${c}` : undefined}>
            {formatDurationMinutes(split[c])}
          </Text>
        </View>
      ))}
      <View className="flex-row justify-between border-t border-line pt-1 dark:border-night-line">
        <Text className="text-sm font-semibold text-ink dark:text-night-ink">{t('otx.total')}</Text>
        <Text className="text-sm font-semibold text-ink dark:text-night-ink" testID={testID ? `${testID}-total` : undefined}>
          {formatDurationMinutes(totalMinutes)}
        </Text>
      </View>
    </View>
  );
}

function CapRow({ label, status, warnPercent, testID }: { label: string; status: OvertimePreview['day']; warnPercent: number; testID: string }) {
  const t = useT();
  return (
    <View className="gap-1" testID={testID}>
      <View className="flex-row justify-between">
        <Text className="text-sm text-ink-muted">{label}</Text>
        <Text className="text-sm text-ink dark:text-night-ink">
          {fill(t('otx.cap.usage'), { total: formatDurationMinutes(status.total), cap: formatDurationMinutes(status.cap) })}
        </Text>
      </View>
      {status.exceeded ? (
        <Badge tone="danger" label={t('otx.cap.exceeded')} testID={`${testID}-exceeded`} />
      ) : status.warn ? (
        <Badge tone="warning" label={fill(t('otx.cap.warn'), { percent: warnPercent })} testID={`${testID}-warn`} />
      ) : null}
    </View>
  );
}

/** A complete period to preview, or null while the user is still typing. */
export const previewInputOf = (v: { kind: OvertimeInput['kind']; workDate: string; start: string; end: string }): OvertimePreviewInput | null =>
  isValidIsoDate(v.workDate) && TIME_RE.test(v.start) && TIME_RE.test(v.end) && v.start !== v.end ? { kind: v.kind, workDate: v.workDate, start: v.start, end: v.end } : null;

export interface OvertimeRequestFormProps {
  today: string;
  /** Preview state for the current period (from `useOvertimePreview`). */
  preview: { data?: OvertimePreview; error: unknown; isFetching: boolean };
  /** Reports the period as the user types so the screen can fetch the preview. */
  onPeriodChange(input: OvertimePreviewInput | null): void;
  onSubmit(input: OvertimeInput): Promise<unknown>;
}

/** OT request (FR-ATT-20): kind, date, times, reason, with the API's split and cap status (FR-ATT-21/22). */
export function OvertimeRequestForm({ today, preview, onPeriodChange, onSubmit }: OvertimeRequestFormProps) {
  const t = useT();
  const [values, setValues] = useState({ kind: 'PRE' as OvertimeInput['kind'], workDate: today, start: '', end: '', reason: '' });
  const [errors, setErrors] = useState<Partial<Record<'workDate' | 'start' | 'end' | 'reason' | 'form', string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof values, value: string) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (key !== 'reason') onPeriodChange(previewInputOf(next));
  };
  const blocked = !!preview.data && (preview.data.day.exceeded || preview.data.month.exceeded);
  const previewError = preview.error ? errorCode(preview.error) : null;

  const submit = async () => {
    const next: typeof errors = {};
    if (!isValidIsoDate(values.workDate)) next.workDate = 'invalid_date';
    if (!TIME_RE.test(values.start)) next.start = 'invalid_time';
    if (!TIME_RE.test(values.end)) next.end = 'invalid_time';
    else if (values.start === values.end) next.end = 'ot_invalid_period';
    if (!values.reason.trim()) next.reason = 'required';
    setErrors(next);
    if (Object.keys(next).length || blocked) return;
    setSubmitting(true);
    try {
      await onSubmit({ ...values, reason: values.reason.trim() });
    } catch (err) {
      setErrors({ form: errorCode(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="gap-4" testID="ot-form">
      <Segmented
        value={values.kind}
        options={OVERTIME_KINDS.map((k) => ({ value: k, label: t(`otx.kind.${k}`), testID: `ot-kind-${k}` }))}
        onChange={(k) => set('kind', k)}
      />
      <TextField label={t('otx.workDate')} value={values.workDate} onChangeText={(v) => set('workDate', v)} placeholder="YYYY-MM-DD" error={errors.workDate && t(errors.workDate)} required testID="ot-workDate" />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField label={t('otx.start')} value={values.start} onChangeText={(v) => set('start', v)} placeholder="HH:mm" keyboardType="numbers-and-punctuation" error={errors.start && t(errors.start)} required testID="ot-start" />
        </View>
        <View className="flex-1">
          <TextField label={t('otx.end')} value={values.end} onChangeText={(v) => set('end', v)} placeholder="HH:mm" keyboardType="numbers-and-punctuation" error={errors.end && t(errors.end)} required testID="ot-end" />
        </View>
      </View>
      <Text className="text-xs text-ink-muted">{t('otx.endHint')}</Text>
      <TextField label={t('otx.reason')} value={values.reason} onChangeText={(v) => set('reason', v)} maxLength={500} error={errors.reason && t(errors.reason)} required testID="ot-reason" />

      <View className="gap-3 rounded-md border border-line p-3 dark:border-night-line" testID="ot-preview">
        <Text className="text-sm font-semibold text-ink dark:text-night-ink">{t('otx.preview.title')}</Text>
        {previewError ? (
          <Text accessibilityRole="alert" className="text-sm text-danger" testID="ot-preview-error">
            {t(previewError)}
          </Text>
        ) : preview.data ? (
          <>
            <OvertimeSplitRows split={preview.data} totalMinutes={preview.data.minutes} testID="ot-preview-split" />
            <CapRow label={t('otx.cap.day')} status={preview.data.day} warnPercent={preview.data.warnPercent} testID="ot-cap-day" />
            <CapRow label={t('otx.cap.month')} status={preview.data.month} warnPercent={preview.data.warnPercent} testID="ot-cap-month" />
          </>
        ) : (
          <Text className="text-sm text-ink-muted">{t('otx.preview.hint')}</Text>
        )}
      </View>

      {errors.form ? (
        <Text accessibilityRole="alert" className="text-sm text-danger" testID="ot-form-error">
          {t(errors.form)}
        </Text>
      ) : null}
      <Button title={t('otx.submit')} onPress={() => void submit()} loading={submitting} disabled={blocked || !!previewError} testID="ot-submit" />
    </View>
  );
}

/** Own OT requests with status, times and counted total. */
export function OvertimeRequestRows({ items }: { items: readonly OvertimeRequestView[] }) {
  const t = useT();
  return (
    <View className="gap-3">
      {items.map((r) => (
        <View key={r.id} testID="ot-item" className="gap-1 rounded-md border border-line bg-white p-4 dark:border-night-line dark:bg-night-surface">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-base font-semibold text-ink dark:text-night-ink">{`${r.workDate} · ${t(`otx.kind.${r.kind}`)}`}</Text>
            <Badge tone={STATUS_TONES[r.status]} label={t(`otx.status.${r.status}`)} />
          </View>
          <Text className="text-sm text-ink-muted">
            {fill(t('otx.planned'), { start: r.plannedStartTime, end: r.plannedEndTime })}
            {r.kind === 'PRE' && r.actualStartTime && r.actualEndTime ? ` · ${fill(t('otx.actual'), { start: r.actualStartTime, end: r.actualEndTime })}` : ''}
          </Text>
          <Text className="text-sm text-ink dark:text-night-ink">{`${t('otx.total')} ${formatDurationMinutes(r.minutes)}`}</Text>
          <Text className="text-xs text-ink-muted" numberOfLines={2}>
            {r.reason}
          </Text>
        </View>
      ))}
    </View>
  );
}
