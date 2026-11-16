'use client';
import type { ExpiringDocument } from '@hrm/shared';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import { ExpiryBadge } from './ExpiryBadge';

const employeeName = (e: ExpiringDocument['employee']) => `${e.firstName} ${e.lastName}`;

/** Expired / expiring documents (FR-EMP-06): a table on md+ screens, stacked cards on phones. */
export function ExpiringDocumentList({ items }: { items: readonly ExpiringDocument[] }) {
  const t = useT();
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-ink-muted dark:border-night-line">
            <tr>
              <th className="py-2 pr-3 font-medium">{t('empx.expiring.employee')}</th>
              <th className="py-2 pr-3 font-medium">{t('employee.branch')}</th>
              <th className="py-2 pr-3 font-medium">{t('document.type')}</th>
              <th className="py-2 pr-3 font-medium">{t('document.number')}</th>
              <th className="py-2 pr-3 font-medium">{t('document.expiresAt')}</th>
              <th className="py-2 font-medium">{t('employee.status')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} className="border-b border-line last:border-0 dark:border-night-line" data-testid="expiring-row">
                <td className="py-3 pr-3">
                  <Link href={`/employees/${d.employee.id}`} className="font-medium text-ink hover:text-primary dark:text-night-ink">
                    {employeeName(d.employee)}
                  </Link>
                  <span className="block text-xs tabular-nums text-ink-muted">{d.employee.employeeCode}</span>
                </td>
                <td className="py-3 pr-3 text-ink-muted">{d.employee.branch?.name ?? '—'}</td>
                <td className="py-3 pr-3">{t(`document.${d.type}`)}</td>
                <td className="py-3 pr-3 tabular-nums text-ink-muted">{d.number ?? '—'}</td>
                <td className="py-3 pr-3 tabular-nums">{d.expiresAt}</td>
                <td className="py-3">
                  <ExpiryBadge expiryStatus={d.expiryStatus} expiryThresholdDays={d.expiryThresholdDays} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col divide-y divide-line dark:divide-night-line md:hidden">
        {items.map((d) => (
          <li key={d.id} data-testid="expiring-card" className="py-3">
            <Link href={`/employees/${d.employee.id}`} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink dark:text-night-ink">{employeeName(d.employee)}</span>
                <span className="block truncate text-xs tabular-nums text-ink-muted">
                  {t(`document.${d.type}`)} · {d.expiresAt} · {d.employee.branch?.name ?? '—'}
                </span>
              </span>
              <ExpiryBadge expiryStatus={d.expiryStatus} expiryThresholdDays={d.expiryThresholdDays} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
