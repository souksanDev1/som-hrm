'use client';
import type { PlatformAuditLogEntry } from '@hrm/shared';
import { useT } from '@/lib/i18n';

const when = (iso: string) => iso.replace('T', ' ').slice(0, 19);

/** Platform audit trail: table on md+, cards on phones. */
export function PlatformAuditList({ items }: { items: readonly PlatformAuditLogEntry[] }) {
  const t = useT();
  const actor = (i: PlatformAuditLogEntry) => i.actorName ?? t('platform.audit.system');
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-ink-muted dark:border-night-line">
            <tr>
              <th className="py-2 pr-3 font-medium">{t('platform.audit.time')}</th>
              <th className="py-2 pr-3 font-medium">{t('platform.audit.action')}</th>
              <th className="py-2 pr-3 font-medium">{t('platform.audit.entity')}</th>
              <th className="py-2 pr-3 font-medium">{t('platform.audit.actor')}</th>
              <th className="py-2 font-medium">{t('platform.audit.ip')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-line last:border-0 dark:border-night-line" data-testid="audit-row">
                <td className="py-2 pr-3 tabular-nums text-ink-muted">{when(i.createdAt)}</td>
                <td className="py-2 pr-3 font-medium text-ink dark:text-night-ink">{i.action}</td>
                <td className="py-2 pr-3 text-ink-muted">{i.entity}</td>
                <td className="py-2 pr-3 text-ink-muted">{actor(i)}</td>
                <td className="py-2 tabular-nums text-ink-muted">{i.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col divide-y divide-line dark:divide-night-line md:hidden">
        {items.map((i) => (
          <li key={i.id} className="py-2" data-testid="audit-card">
            <p className="break-all text-sm font-medium text-ink dark:text-night-ink">{i.action}</p>
            <p className="text-xs tabular-nums text-ink-muted">
              {when(i.createdAt)} · {i.entity} · {actor(i)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
