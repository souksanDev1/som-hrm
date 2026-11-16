'use client';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Card, ConfirmDialog, Field, Input, Modal, StateView } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

export interface OrgEntity {
  id: string;
  name: string;
  meta?: string;
  /** `false` marks a closed item (shown dimmed with a badge). Omitted = open. */
  isActive?: boolean;
}

export interface OrgEntityListProps {
  title: string;
  testId: string;
  items: readonly OrgEntity[];
  canEdit: boolean;
  creating?: boolean;
  /** True while a rename or delete is in flight. */
  saving?: boolean;
  error?: unknown;
  onCreate(name: string): Promise<unknown>;
  /** Deletion is confirmed with a dialog first. */
  onDelete(id: string): Promise<unknown> | void;
  /** Optional: enables a rename action per row. */
  onRename?(id: string, name: string): Promise<unknown>;
  /** Optional: an "edit" action per row that opens the caller's own form (takes precedence over `onRename`). */
  onEdit?(item: OrgEntity): void;
  /** Optional: close (deactivate, confirmed first) / reopen actions per row. */
  onSetActive?(id: string, isActive: boolean): Promise<unknown>;
}

/** Reusable list + inline "add by name" form for branches, departments and positions. */
export function OrgEntityList({
  title,
  testId,
  items,
  canEdit,
  creating,
  saving,
  error,
  onCreate,
  onDelete,
  onRename,
  onEdit,
  onSetActive,
}: OrgEntityListProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<OrgEntity | null>(null);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<OrgEntity | null>(null);
  const [closing, setClosing] = useState<OrgEntity | null>(null);
  const errorCode = error instanceof ApiError ? error.code : 'unknown';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim());
    setName('');
  };
  const rename = async () => {
    if (!renaming || !onRename || !newName.trim()) return;
    await onRename(renaming.id, newName.trim());
    setRenaming(null);
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await onDelete(deleting.id);
    } finally {
      setDeleting(null);
    }
  };
  const confirmClose = async () => {
    if (!closing || !onSetActive) return;
    try {
      await onSetActive(closing.id, false);
    } finally {
      setClosing(null);
    }
  };

  return (
    <Card title={title} data-testid={testId}>
      {canEdit && (
        <form onSubmit={(e) => void submit(e).catch(() => undefined)} className="mb-3 flex gap-2">
          <Input aria-label={title} value={name} onChange={(e) => setName(e.target.value)} placeholder={`${t('common.add')}…`} />
          <Button type="submit" icon="add" loading={creating} aria-label={t('common.add')} />
        </form>
      )}
      {error ? (
        <p role="alert" className="mb-2 text-sm text-danger">
          {t(errorCode === 'in_use' && onSetActive ? 'orgx.inUseHint' : errorCode)}
        </p>
      ) : null}
      {items.length === 0 ? (
        <StateView kind="empty" title={t('common.empty')} />
      ) : (
        <ul className="flex flex-col divide-y divide-line dark:divide-night-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 py-2" data-testid="org-entity-row" data-closed={i.isActive === false || undefined}>
              <span className={cn('min-w-0 flex-1 truncate text-sm text-ink dark:text-night-ink', i.isActive === false && 'text-ink-muted line-through')}>
                {i.name}
              </span>
              {i.isActive === false && <Badge>{t('orgx.closed')}</Badge>}
              {i.meta && <span className="text-xs tabular-nums text-ink-muted">{i.meta}</span>}
              {canEdit && onEdit && (
                <Button size="sm" variant="ghost" icon="edit" aria-label={`${t('orgx.edit')} ${i.name}`} onClick={() => onEdit(i)} />
              )}
              {canEdit && onSetActive && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={i.isActive === false ? 'lock_open' : 'block'}
                  aria-label={`${t(i.isActive === false ? 'orgx.reopen' : 'orgx.close')} ${i.name}`}
                  onClick={() => (i.isActive === false ? void Promise.resolve(onSetActive(i.id, true)).catch(() => undefined) : setClosing(i))}
                />
              )}
              {canEdit && onRename && !onEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="edit"
                  aria-label={`${t('empx.org.rename')} ${i.name}`}
                  onClick={() => {
                    setNewName(i.name);
                    setRenaming(i);
                  }}
                />
              )}
              {canEdit && <Button size="sm" variant="ghost" icon="delete" aria-label={`${t('common.delete')} ${i.name}`} onClick={() => setDeleting(i)} />}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!renaming}
        title={t('empx.org.rename')}
        onClose={() => setRenaming(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>{t('common.cancel')}</Button>
            <Button loading={saving} onClick={() => void rename().catch(() => undefined)} data-testid="save-rename">{t('common.save')}</Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void rename().catch(() => undefined);
          }}
        >
          <Field label={t('empx.org.name')} htmlFor={`${testId}-rename`}>
            <Input id={`${testId}-rename`} value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={t('empx.org.deleteTitle')}
        message={t('empx.org.deleteMessage').replace('{name}', deleting?.name ?? '')}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={saving}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete().catch(() => undefined)}
      />

      <ConfirmDialog
        open={!!closing}
        title={t('orgx.closeTitle')}
        message={t('orgx.closeMessage').replace('{name}', closing?.name ?? '')}
        confirmLabel={t('orgx.close')}
        loading={saving}
        onCancel={() => setClosing(null)}
        onConfirm={() => void confirmClose().catch(() => undefined)}
      />
    </Card>
  );
}
