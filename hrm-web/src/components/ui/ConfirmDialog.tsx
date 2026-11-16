'use client';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  /** Label of the confirming button (e.g. "Delete"). */
  confirmLabel: string;
  /** Defaults to the translated "Cancel". */
  cancelLabel?: string;
  /** `danger` renders a red confirm button for destructive actions. */
  tone?: 'danger' | 'default';
  /** Shows a spinner on the confirm button and blocks double submits. */
  loading?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

/** Yes/no confirmation before an irreversible action (delete, close, …). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading} data-testid="confirm-cancel">
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={onConfirm} data-testid="confirm-accept">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink dark:text-night-ink">{message}</div>
    </Modal>
  );
}
