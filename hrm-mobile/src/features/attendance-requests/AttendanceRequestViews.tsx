import type { Correction, CreateCorrectionInput, CreateDeviceChangeInput, DeviceChangeRequest } from '@hrm/shared';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, InfoRow, TextField } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { DeviceIdentity } from './device-identity';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const statusTone = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' } as const;

export interface ChangeDeviceFormProps {
  device: DeviceIdentity;
  onSubmit(input: CreateDeviceChangeInput): Promise<unknown>;
}

/** Ask HR to bind this phone instead of the current one (FR-ATT-11.2). */
export function ChangeDeviceForm({ device, onSubmit }: ChangeDeviceFormProps) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) {
      setError('required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ deviceId: device.deviceId, platform: device.platform, model: device.model, reason: reason.trim() });
      setSent(true);
      setReason('');
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      <InfoRow label={t('attreq.deviceChange.thisDevice')} value={device.model ?? device.platform} testID="device-this" />
      <TextField label={t('attreq.deviceChange.reason')} required value={reason} onChangeText={setReason} maxLength={500} testID="device-reason" />
      {error ? (
        <Text accessibilityRole="alert" testID="device-error" className="text-sm text-danger">
          {t(error)}
        </Text>
      ) : null}
      {sent ? (
        <Text testID="device-sent" className="text-sm text-success">
          {t('attreq.deviceChange.submitted')}
        </Text>
      ) : null}
      <Button title={t('attreq.deviceChange.submit')} loading={busy} onPress={() => void submit()} testID="device-submit" />
    </View>
  );
}

export function DeviceRequestList({ items }: { items: readonly DeviceChangeRequest[] }) {
  const t = useT();
  return (
    <View>
      {items.map((r) => (
        <View key={r.id} testID="device-request" className="flex-row items-center justify-between gap-2 border-b border-line py-2.5 dark:border-night-line">
          <View className="flex-1">
            <Text className="text-sm text-ink dark:text-night-ink">{r.model ?? r.platform}</Text>
            <Text className="text-xs text-ink-muted">
              {r.createdAt.slice(0, 10)} · {r.reason}
            </Text>
          </View>
          <Badge label={t(`approval.status.${r.status}`)} tone={statusTone[r.status]} />
        </View>
      ))}
    </View>
  );
}

type FieldName = 'workDate' | 'requestedCheckIn' | 'requestedCheckOut' | 'reason' | 'form';

export interface CorrectionFormProps {
  /** Default work date (YYYY-MM-DD). */
  initialDate: string;
  onSubmit(input: CreateCorrectionInput): Promise<unknown>;
}

/** Request a correction of a missed / wrong check-in or check-out (FR-ATT-19.1). */
export function CorrectionForm({ initialDate, onSubmit }: CorrectionFormProps) {
  const t = useT();
  const [workDate, setWorkDate] = useState(initialDate);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (!DATE.test(workDate)) next.workDate = 'invalid_date';
    if (checkIn && !TIME.test(checkIn)) next.requestedCheckIn = 'invalid_time';
    if (checkOut && !TIME.test(checkOut)) next.requestedCheckOut = 'invalid_time';
    if (!checkIn && !checkOut) next.requestedCheckIn = 'correction_time_required';
    if (!reason.trim()) next.reason = 'required';
    setErrors(next);
    setSent(false);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await onSubmit({ workDate, requestedCheckIn: checkIn || undefined, requestedCheckOut: checkOut || undefined, reason: reason.trim() });
      setSent(true);
      setCheckIn('');
      setCheckOut('');
      setReason('');
    } catch (err) {
      const code = errorCode(err);
      const field = (err as { details?: { field?: FieldName } }).details?.field;
      setErrors({ [field ?? 'form']: code });
    } finally {
      setBusy(false);
    }
  };
  const err = (k: FieldName) => (errors[k] ? t(errors[k]!) : undefined);

  return (
    <View className="gap-4">
      <TextField label={t('attreq.correction.workDate')} required value={workDate} onChangeText={setWorkDate} placeholder="YYYY-MM-DD" maxLength={10} error={err('workDate')} testID="correction-date" />
      <TextField label={t('attreq.correction.checkIn')} value={checkIn} onChangeText={setCheckIn} placeholder="08:00" maxLength={5} error={err('requestedCheckIn')} testID="correction-in" />
      <TextField label={t('attreq.correction.checkOut')} value={checkOut} onChangeText={setCheckOut} placeholder="17:00" maxLength={5} error={err('requestedCheckOut')} testID="correction-out" />
      <Text className="text-xs text-ink-muted">{t('attreq.correction.nextDayHint')}</Text>
      <TextField label={t('attreq.correction.reason')} required value={reason} onChangeText={setReason} maxLength={500} error={err('reason')} testID="correction-reason" />
      {errors.form ? (
        <Text accessibilityRole="alert" testID="correction-error" className="text-sm text-danger">
          {t(errors.form)}
        </Text>
      ) : null}
      {sent ? (
        <Text testID="correction-sent" className="text-sm text-success">
          {t('attreq.correction.submitted')}
        </Text>
      ) : null}
      <Button title={t('attreq.correction.submit')} loading={busy} onPress={() => void submit()} testID="correction-submit" />
    </View>
  );
}

/** Own corrections with original vs requested times. */
export function CorrectionList({ items }: { items: readonly Correction[] }) {
  const t = useT();
  const line = (label: string, s: Correction['checkIn']) =>
    s.requested ? (
      <Text className="text-sm text-ink dark:text-night-ink">
        {label}: {s.original ?? t('attreq.correction.missing')} → {s.requested}
      </Text>
    ) : null;
  return (
    <View>
      {items.map((c) => (
        <View key={c.id} testID="correction-item" className="gap-1 border-b border-line py-2.5 dark:border-night-line">
          <View className="flex-row items-center justify-between">
            <Text className="font-medium text-ink dark:text-night-ink">{c.workDate}</Text>
            <Badge label={t(`approval.status.${c.status}`)} tone={statusTone[c.status]} testID="correction-status" />
          </View>
          {line(t('attreq.correction.checkIn'), c.checkIn)}
          {line(t('attreq.correction.checkOut'), c.checkOut)}
          <Text className="text-xs text-ink-muted">{c.reason}</Text>
        </View>
      ))}
    </View>
  );
}
