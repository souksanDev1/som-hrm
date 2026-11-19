'use client';
import { nameInitial, type OrgStructureNode } from '@hrm/shared';
import { useState } from 'react';
import { Icon } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { usePanZoom } from '../pan-zoom';

/** Levels 0 and 1 (Chairman, CEO) start expanded, so the departments under the CEO are visible. */
const OPEN_DEPTH = 2;

export const structureNodeName = (node: OrgStructureNode, t: ReturnType<typeof useT>) =>
  node.kind === 'unassigned' ? t('org.structure.unassigned') : node.name;

function OrgBox({ node, open, onToggle, onOpenDetail }: { node: OrgStructureNode; open: boolean; onToggle(): void; onOpenDetail(): void }) {
  const t = useT();
  const name = structureNodeName(node, t);
  const hasChildren = node.children.length > 0;
  return (
    <div
      data-testid={`org-box-${node.id}`}
      className="flex w-[220px] gap-2 rounded-md bg-[#26308f] p-2 text-left text-white shadow-md ring-1 ring-black/10"
    >
      <span
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white/15 text-lg font-semibold"
      >
        {node.kind === 'unassigned' ? <Icon name="person_off" className="text-[24px]" /> : node.head ? nameInitial(node.head.name) : <Icon name="apartment" className="text-[24px]" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold" title={name}>
          {name}
        </span>
        <span className="truncate text-xs text-white/80" title={node.head?.name}>
          {node.head?.name ?? ' '}
        </span>
        <div className="mt-auto flex items-center gap-3 pt-1 text-xs">
          <span className="flex items-center gap-0.5" title={t('org.structure.subUnits')}>
            <Icon name="account_tree" className="text-[16px]" />
            {node.children.length}
          </span>
          <span className="flex items-center gap-0.5" title={t('org.structure.employees')}>
            <Icon name="group" className="text-[16px]" />
            {node.employeeCount}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              data-testid={`org-detail-${node.id}`}
              onClick={onOpenDetail}
              aria-label={t('org.structure.openDetail')}
              title={t('org.structure.openDetail')}
              className="rounded p-0.5 hover:bg-white/15"
            >
              <Icon name="list_alt" className="text-[18px]" />
            </button>
            {hasChildren && (
              <button
                type="button"
                data-testid={`org-toggle-${node.id}`}
                onClick={onToggle}
                aria-expanded={open}
                aria-label={open ? t('org.structure.collapse') : t('org.structure.expand')}
                className="rounded-full p-0.5 ring-1 ring-white/60 hover:bg-white/15"
              >
                <Icon name={open ? 'expand_less' : 'expand_more'} className="text-[16px]" />
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function OrgBranch({ node, depth, onOpenDetail }: { node: OrgStructureNode; depth: number; onOpenDetail(n: OrgStructureNode): void }) {
  const [open, setOpen] = useState(depth < OPEN_DEPTH);
  const showChildren = open && node.children.length > 0;
  return (
    <li>
      <OrgBox node={node} open={open} onToggle={() => setOpen((v) => !v)} onOpenDetail={() => onOpenDetail(node)} />
      {showChildren && (
        <ul>
          {node.children.map((c) => (
            <OrgBranch key={c.id} node={c} depth={depth + 1} onOpenDetail={onOpenDetail} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Department structure as a top-down box tree inside a view-only pan/zoom viewport. */
export function OrgStructureChart({ roots, onOpenDetail }: { roots: readonly OrgStructureNode[]; onOpenDetail(node: OrgStructureNode): void }) {
  const t = useT();
  const { view, viewportRef, contentRef, zoomIn, zoomOut, fit } = usePanZoom();
  if (roots.length === 0) {
    return <p className="p-8 text-center text-sm text-ink-muted">{t('org.structure.empty')}</p>;
  }
  const tool = 'flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-ink shadow-sm hover:bg-canvas dark:border-night-line dark:bg-night-surface dark:text-night-ink';
  return (
    <div className="relative h-full w-full">
      <div className="absolute right-3 top-3 z-10 flex gap-1">
        <button type="button" className={tool} onClick={zoomIn} data-testid="org-zoom-in" aria-label={t('org.structure.zoomIn')} title={t('org.structure.zoomIn')}>
          <Icon name="add" className="text-[20px]" />
        </button>
        <button type="button" className={tool} onClick={zoomOut} data-testid="org-zoom-out" aria-label={t('org.structure.zoomOut')} title={t('org.structure.zoomOut')}>
          <Icon name="remove" className="text-[20px]" />
        </button>
        <button type="button" className={tool} onClick={fit} data-testid="org-fit" aria-label={t('org.structure.fit')} title={t('org.structure.fit')}>
          <Icon name="fit_screen" className="text-[20px]" />
        </button>
      </div>
      <div ref={viewportRef} className="h-full w-full cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing">
        <div
          ref={contentRef}
          data-testid="org-canvas"
          className="w-max p-6"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0' }}
        >
          <ul className="org-tree w-max" data-testid="org-structure">
            {roots.map((n) => (
              <OrgBranch key={n.id} node={n} depth={0} onOpenDetail={onOpenDetail} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
