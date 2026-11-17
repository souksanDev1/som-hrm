'use client';
import { useState } from 'react';
import { Button, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

export type ApprovalDecisionAction = 'approve' | 'reject';

export interface DecisionFormProps {
  onDecide(decision: ApprovalDecisionAction, note: string): Promise<unknown>;
}

/** Note + approve / reject. A rejection needs a reason (checked here and by the API). */
export function DecisionForm({ onDecide }: DecisionFormProps) {
  const t = useT();
  const [note, setNote] = useState('');
  const [error, setError] = useState<{ field?: string; code: string } | null>(null);
  const [busy, setBusy] = useState<ApprovalDecisionAction | null>(null);

  const decide = async (decision: ApprovalDecisionAction) => {
    if (decision === 'reject' && !note.trim()) {
      setError({ field: 'note', code: 'required' });
      return;
    }
    setError(null);
    setBusy(decision);
    try {
      await onDecide(decision, note.trim());
    } catch (err) {
      setError({ code: err instanceof ApiError ? err.code : 'unknown' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="decision-form">
      <Field label={t('approval.noteOptional')} htmlFor="approval-note" error={error?.field === 'note' ? t('approval.rejectReason') : undefined}>
        <Input id="approval-note" value={note} maxLength={500} invalid={error?.field === 'note'} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && !error.field && (
        <p role="alert" data-testid="decision-error" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(error.code)}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="danger" icon="close" loading={busy === 'reject'} disabled={!!busy} onClick={() => void decide('reject')} data-testid="approval-reject">
          {t('approval.reject')}
        </Button>
        <Button icon="check" loading={busy === 'approve'} disabled={!!busy} onClick={() => void decide('approve')} data-testid="approval-approve">
          {t('approval.approve')}
        </Button>
      </div>
    </div>
  );
}
