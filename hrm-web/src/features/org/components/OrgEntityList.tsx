'use client';
import { useState, type FormEvent } from 'react';
import { Button, Card, Input, StateView } from '@/components/ui';
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
  error?: unknown;
  onCreate(name: string): Promise<unknown>;
  onDelete(id: string): void;
}

/** Reusable list + inline "add by name" form for branches, departments and positions. */
export function OrgEntityList({ title, testId, items, canEdit, creating, error, onCreate, onDelete }: OrgEntityListProps) {
  const t = useT();
  const [name, setName] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim());
    setName('');
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
            <li key={i.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink dark:text-night-ink">{i.name}</span>
              {i.meta && <span className="text-xs tabular-nums text-ink-muted">{i.meta}</span>}
              {canEdit && <Button size="sm" variant="ghost" icon="delete" aria-label={`${t('common.delete')} ${i.name}`} onClick={() => onDelete(i.id)} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
