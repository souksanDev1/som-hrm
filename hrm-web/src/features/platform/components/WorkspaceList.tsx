'use client';
import type { PlatformWorkspace } from '@hrm/shared';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { WorkspaceStatusBadge } from './WorkspaceStatusBadge';

const seats = (w: PlatformWorkspace) => `${w.employeeCount} / ${w.seatLimit}`;

/** Responsive list: a table on md+ screens, stacked cards on phones. */
export function WorkspaceList({ items }: { items: readonly PlatformWorkspace[] }) {
  const t = useT();
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-ink-muted dark:border-night-line">
            <tr>
              <th className="py-2 pr-3 font-medium">{t('platform.workspace.code')}</th>
              <th className="py-2 pr-3 font-medium">{t('platform.workspace.name')}</th>
              <th className="py-2 pr-3 font-medium">{t('platform.workspace.seats')}</th>
              <th className="py-2 pr-3 font-medium">{t('platform.workspace.createdAt')}</th>
              <th className="py-2 font-medium">{t('platform.workspace.status')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id} className="border-b border-line last:border-0 hover:bg-canvas dark:border-night-line dark:hover:bg-night-line" data-testid="workspace-row">
                <td className="py-3 pr-3 tabular-nums text-ink-muted">{w.code}</td>
                <td className="py-3 pr-3">
                  <Link href={`/platform/workspaces/${w.id}`} className="font-medium text-ink hover:text-primary dark:text-night-ink">
                    {w.name}
                  </Link>
                </td>
                <td className="py-3 pr-3 tabular-nums text-ink-muted">{seats(w)}</td>
                <td className="py-3 pr-3 tabular-nums text-ink-muted">{w.createdAt.slice(0, 10)}</td>
                <td className="py-3">
                  <WorkspaceStatusBadge status={w.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col divide-y divide-line dark:divide-night-line md:hidden">
        {items.map((w) => (
          <li key={w.id} data-testid="workspace-card">
            <Link href={`/platform/workspaces/${w.id}`} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink dark:text-night-ink">{w.name}</span>
                <span className="block truncate text-xs tabular-nums text-ink-muted">
                  {w.code} · {seats(w)}
                </span>
              </span>
              <WorkspaceStatusBadge status={w.status} />
              <Icon name="chevron_right" className="text-ink-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
