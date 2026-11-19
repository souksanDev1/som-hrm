'use client';
import { nameInitial, type OrgStructureMember, type OrgStructureNode } from '@hrm/shared';
import Link from 'next/link';
import { useEffect } from 'react';
import { Badge, Icon } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { structureNodeName } from './OrgStructureChart';

function PersonRow({ person, isHead }: { person: OrgStructureMember; isHead?: boolean }) {
  const t = useT();
  return (
    <li className="border-b border-line last:border-b-0 dark:border-night-line">
      <Link href={`/employees/${person.id}`} className="flex items-center gap-3 px-1 py-2.5 hover:bg-canvas dark:hover:bg-night-line">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
          {nameInitial(person.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink dark:text-night-ink">{person.name}</span>
          <span className="block truncate text-xs text-ink-muted">{person.position ?? person.employeeCode}</span>
        </span>
        {isHead && <Badge tone="success">{t('org.structure.manager')}</Badge>}
      </Link>
    </li>
  );
}

/** Right-side drawer listing a department's head (first, badged) and members. Esc or ✕ closes it. */
export function StructureDetailPanel({ node, onClose }: { node: OrgStructureNode | null; onClose(): void }) {
  const t = useT();
  useEffect(() => {
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [node, onClose]);
  if (!node) return null;
  const empty = !node.head && node.members.length === 0;
  return (
    <aside
      role="dialog"
      aria-label={t('org.structure.detail')}
      data-testid="org-detail-panel"
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-white shadow-2xl dark:bg-night-surface sm:w-[380px]"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-night-line">
        <h2 className="text-base font-semibold text-ink dark:text-night-ink">{t('org.structure.detail')}</h2>
        <button type="button" onClick={onClose} aria-label="close" className="rounded p-1 text-ink-muted hover:bg-canvas dark:hover:bg-night-line">
          <Icon name="close" className="text-[22px]" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <h3 className="text-lg font-semibold text-ink dark:text-night-ink">{structureNodeName(node, t)}</h3>
        <p className="mb-3 flex items-center gap-1 text-xs text-ink-muted">
          <Icon name="group" className="text-[16px]" />
          <span className="font-semibold">{node.employeeCount}</span> {t('org.structure.employees')}
        </p>
        {empty ? (
          <p className="py-6 text-center text-sm text-ink-muted">{t('org.structure.noMembers')}</p>
        ) : (
          <ul>
            {node.head && <PersonRow person={node.head} isHead />}
            {node.members.map((m) => (
              <PersonRow key={m.id} person={m} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
