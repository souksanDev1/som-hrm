'use client';
import { useState, type FormEvent } from 'react';
import { Button, Card, ConfirmDialog, Field, Input, Modal, StateView } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

export interface OrgEntity {
  id: string;
  name: string;
  meta?: string;
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
}

/** Reusable list + inline "add by name" form for branches, departments and positions. */
export function OrgEntityList({ title, testId, items, canEdit, creating, saving, error, onCreate, onDelete, onRename }: OrgEntityListProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<OrgEntity | null>(null);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<OrgEntity | null>(null);

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

  return (
    <Card title={title} data-testid={testId}>
      {canEdit && (
        <form onSubmit={(e) => void submit(e).catch(() => undefined)} className="mb-3 flex gap-2">
          <Input aria-label={title} value={name} onChange={(e) => setName(e.target.value)} placeholder={`${t('common.add')}…`} />
          <Button type="submit" icon="add" loading={creating} aria-label={t('common.add')} />
        </form>
      )}
      {error ? <p role="alert" className="mb-2 text-sm text-danger">{t(error instanceof ApiError ? error.code : 'unknown')}</p> : null}
      {items.length === 0 ? (
        <StateView kind="empty" title={t('common.empty')} />
      ) : (
        <ul className="flex flex-col divide-y divide-line dark:divide-night-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 py-2" data-testid="org-entity-row">
              <span className="min-w-0 flex-1 truncate text-sm text-ink dark:text-night-ink">{i.name}</span>
              {i.meta && <span className="text-xs tabular-nums text-ink-muted">{i.meta}</span>}
              {canEdit && onRename && (
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
    </Card>
  );
}
