import { interpolate as fill, type CreateDelegationInput, type DelegateCandidate, type Delegation, type DelegationStatus } from '@hrm/shared';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, TextField, type BadgeTone } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useT } from '@/lib/i18n';

const STATUS_TONES: Record<DelegationStatus, BadgeTone> = { ACTIVE: 'success', SCHEDULED: 'primary', ENDED: 'neutral', CANCELLED: 'neutral' };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Delegations of (or to) the signed-in user; their own active/scheduled ones can be cancelled. */
export function DelegationList({ items, userId, onCancel }: { items: readonly Delegation[]; userId: string | undefined; onCancel(d: Delegation): void }) {
  const t = useT();
  const name = (p: { userId: string; name: string }) => (p.userId === userId ? t('delegation.me') : p.name);
  if (items.length === 0) return <Text className="text-sm text-ink-muted">{t('delegation.empty')}</Text>;
  return (
    <View>
      {items.map((d) => (
        <View key={d.id} testID="delegation-row" className="gap-1 border-b border-line py-3 last:border-b-0 dark:border-night-line">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-sm font-medium text-ink dark:text-night-ink">{`${name(d.delegator)} → ${name(d.delegate)}`}</Text>
            <Badge tone={STATUS_TONES[d.status]} label={t(`delegation.status.${d.status}`)} />
          </View>
          <Text className="text-sm text-ink-muted">
            {fill(t('delegation.period'), { start: d.startDate, end: d.endDate })}
            {d.reason ? ` · ${d.reason}` : ''}
          </Text>
          {(d.status === 'ACTIVE' || d.status === 'SCHEDULED') && d.delegator.userId === userId ? (
            <Button title={t('delegation.cancel')} variant="ghost" onPress={() => onCancel(d)} testID="delegation-cancel" />
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Appoint a delegate for a date range (FR-ORG-03.1); the API re-checks overlap, self and activity. */
export function DelegationForm({ candidates, today, onSubmit }: { candidates: readonly DelegateCandidate[]; today: string; onSubmit(input: CreateDelegationInput): Promise<unknown> }) {
  const t = useT();
  const [delegateUserId, setDelegateUserId] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ delegate?: string; startDate?: string; endDate?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (!delegateUserId) next.delegate = 'required';
    if (!ISO_DATE.test(startDate)) next.startDate = 'invalid_date';
    if (!ISO_DATE.test(endDate)) next.endDate = 'invalid_date';
    else if (endDate < startDate) next.endDate = 'end_before_start';
    else if (endDate < today) next.endDate = 'delegation_in_past';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await onSubmit({ delegateUserId, startDate, endDate, reason: reason.trim() || undefined });
    } catch (err) {
      setErrors({ form: errorCode(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3" testID="delegation-form">
      <Text className="text-sm font-medium text-ink dark:text-night-ink">{t('delegation.delegate')}</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {candidates.map((c) => {
          const selected = c.userId === delegateUserId;
          return (
            <Pressable
              key={c.userId}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setDelegateUserId(c.userId)}
              testID={`delegate-option-${c.employeeCode ?? c.userId}`}
              className={`min-h-12 justify-center rounded-full border px-3 ${selected ? 'border-primary bg-primary-soft' : 'border-line bg-white dark:border-night-line dark:bg-night-surface'}`}
            >
              <Text className={selected ? 'text-primary' : 'text-ink dark:text-night-ink'}>{c.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {errors.delegate ? <Text className="text-sm text-danger">{t(errors.delegate)}</Text> : null}
      <TextField label={t('delegation.startDate')} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" error={errors.startDate && t(errors.startDate)} testID="delegation-start" required />
      <TextField label={t('delegation.endDate')} value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" error={errors.endDate && t(errors.endDate)} testID="delegation-end" required />
      <TextField label={t('delegation.reason')} value={reason} onChangeText={setReason} maxLength={500} testID="delegation-reason" />
      {errors.form ? (
        <Text accessibilityRole="alert" className="text-sm text-danger" testID="delegation-error">
          {t(errors.form)}
        </Text>
      ) : null}
      <Button title={t('common.save')} loading={busy} onPress={() => void submit()} testID="delegation-save" />
    </View>
  );
}
