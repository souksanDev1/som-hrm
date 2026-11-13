'use client';
import type { OrgChartNode } from '@hrm/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/ui';

function NodeItem({ node, depth }: { node: OrgChartNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={false}>
      <div className="flex items-center gap-2 rounded-sm py-1.5 hover:bg-canvas dark:hover:bg-night-line" style={{ paddingLeft: `${depth * 1.25}rem` }}>
        {hasChildren ? (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-label={open ? 'collapse' : 'expand'} className="rounded p-0.5 text-ink-muted">
            <Icon name={open ? 'expand_more' : 'chevron_right'} className="text-[20px]" />
          </button>
        ) : (
          <span className="w-6" />
        )}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
          {node.name.slice(0, 1)}
        </span>
        <Link href={`/employees/${node.id}`} className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink dark:text-night-ink" data-testid="org-node">{node.name}</span>
          <span className="block truncate text-xs text-ink-muted">
            {[node.position, node.department].filter(Boolean).join(' · ') || node.employeeCode}
          </span>
        </Link>
        {hasChildren && <span className="text-xs tabular-nums text-ink-muted">{node.children.length}</span>}
      </div>
      {hasChildren && open && (
        <ul role="group">
          {node.children.map((c) => (
            <NodeItem key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Collapsible manager → reports tree; indentation keeps it readable on phones. */
export function OrgChartTree({ roots }: { roots: readonly OrgChartNode[] }) {
  return (
    <ul role="tree" aria-label="org chart" className="flex flex-col">
      {roots.map((n) => (
        <NodeItem key={n.id} node={n} depth={0} />
      ))}
    </ul>
  );
}
