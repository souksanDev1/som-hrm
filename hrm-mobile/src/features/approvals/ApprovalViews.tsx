import { interpolate as fill, type ApprovalCapacity, type ApprovalDecision, type ApprovalInboxItem, type ApprovalStep, type RequestStatus } from '@hrm/shared';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, TextField, type BadgeTone } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useT } from '@/lib/i18n';

const day = (iso: string) => iso.slice(0, 10);

const DECISION_TONES: Record<ApprovalDecision, BadgeTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', ESCALATED: 'neutral' };
const STATUS_TONES: Record<RequestStatus, BadgeTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' };

export function CapacityBadge({ capacity }: { capacity: ApprovalCapacity }) {
  const t = useT();
  return <Badge tone={capacity === 'MANAGER' ? 'primary' : 'neutral'} label={t(`approval.capacity.${capacity}`)} />;
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const t = useT();
  return <Badge tone={STATUS_TONES[status]} label={t(`approval.status.${status}`)} testID="approval-status" />;
}

/** Requests waiting for the signed-in user; tapping a row opens it. */
export function ApprovalInboxList({ items, onOpen }: { items: readonly ApprovalInboxItem[]; onOpen(id: string): void }) {
  const t = useT();
  return (
    <View className="gap-3">
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => onOpen(item.id)}
          testID="approval-row"
          className="gap-1 rounded-md border border-line bg-white p-4 active:bg-canvas dark:border-night-line dark:bg-night-surface"
        >
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-base font-semibold text-ink dark:text-night-ink">{item.requester.name}</Text>
            <CapacityBadge capacity={item.myCapacity} />
          </View>
          <Text className="text-sm text-ink dark:text-night-ink">{`${t(`approval.subject.${item.subjectType}`)} · ${item.summary.title}`}</Text>
          {item.summary.detail ? <Text className="text-sm text-ink-muted">{item.summary.detail}</Text> : null}
          <Text className="text-xs text-ink-muted">
            {`${fill(t('approval.level'), { level: item.level, total: item.requiredLevels })} · ${fill(t('approval.pendingSince'), { date: day(item.pendingSince) })}`}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Who each level was routed to and who decided it, in what capacity (FR-ORG-06). */
export function ApprovalStepList({
  steps,
  requiredLevels,
  requestStatus,
}: {
  steps: readonly ApprovalStep[];
  requiredLevels: number;
  /** A CANCELLED request shows its still-open step as withdrawn (FR-LV-12.1). */
  requestStatus?: RequestStatus;
}) {
  const t = useT();
  return (
    <View>
      {steps.map((s) => {
        const withdrawn = requestStatus === 'CANCELLED' && s.decision === 'PENDING';
        return (
          <View key={s.id} testID="approval-step" className="gap-1 border-b border-line py-3 last:border-b-0 dark:border-night-line">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-sm font-medium text-ink dark:text-night-ink">{fill(t('approval.level'), { level: s.level, total: Math.max(requiredLevels, s.level) })}</Text>
              {withdrawn ? (
                <Badge tone="neutral" label={t('approval.withdrawn')} />
              ) : (
                <Badge tone={DECISION_TONES[s.decision]} label={t(`approval.decision.${s.decision}`)} />
              )}
              <CapacityBadge capacity={s.actingAs} />
            </View>
            <Text className="text-sm text-ink dark:text-night-ink">
              {s.approver?.name ?? t('approval.hrPool')}
              {s.delegate ? ` · ${fill(t('approval.delegateOf'), { name: s.delegate.name })}` : ''}
            </Text>
            <Text className="text-xs text-ink-muted" testID="approval-step-meta">
              {withdrawn
                ? `${s.decidedBy ? fill(t('approval.withdrawnBy'), { name: s.decidedBy.name }) : t('approval.withdrawn')} · ${day(s.decidedAt ?? s.createdAt)}`
                : s.decidedBy
                ? `${fill(t('approval.decidedBy'), { name: s.decidedBy.name, capacity: t(`approval.capacity.${s.actingAs}`) })} · ${day(s.decidedAt ?? s.createdAt)}`
                : s.decision === 'PENDING'
                  ? fill(t('approval.pendingSince'), { date: day(s.createdAt) })
                  : day(s.decidedAt ?? s.createdAt)}
            </Text>
            {s.note ? <Text className="text-sm italic text-ink-muted">{`“${s.note}”`}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/** Note + approve / reject; a rejection needs a reason (also enforced by the API). */
export function ApprovalDecisionPanel({ capacity, onDecide }: { capacity: ApprovalCapacity; onDecide(decision: 'approve' | 'reject', note: string): Promise<unknown> }) {
  const t = useT();
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  const decide = async (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !note.trim()) {
      setNoteError(true);
      return;
    }
    setNoteError(false);
    setError(null);
    setBusy(decision);
    try {
      await onDecide(decision, note.trim());
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-3" testID="decision-form">
      <Text className="text-sm text-ink-muted" testID="approval-my-capacity">
        {fill(t('approval.asCapacity'), { capacity: t(`approval.capacity.${capacity}`) })}
      </Text>
      <TextField label={t('approval.noteOptional')} value={note} onChangeText={setNote} maxLength={500} error={noteError ? t('approval.rejectReason') : undefined} testID="approval-note" />
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-danger" testID="decision-error">
          {t(error)}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button className="flex-1" title={t('approval.reject')} variant="danger" loading={busy === 'reject'} disabled={!!busy} onPress={() => void decide('reject')} testID="approval-reject" />
        <Button className="flex-1" title={t('approval.approve')} loading={busy === 'approve'} disabled={!!busy} onPress={() => void decide('approve')} testID="approval-approve" />
      </View>
    </View>
  );
}
