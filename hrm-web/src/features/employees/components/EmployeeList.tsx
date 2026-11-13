'use client';
import type { EmployeeSummary } from '@hrm/shared';
import Link from 'next/link';
import { Badge, Icon } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { StatusBadge } from './StatusBadge';

/** Responsive list: a table on md+ screens, stacked cards on phones. */
export function EmployeeList({ items }: { items: readonly EmployeeSummary[] }) {
  const t = useT();
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-ink-muted dark:border-night-line">
            <tr>
              <th className="py-2 pr-3 font-medium">{t('employee.code')}</th>
              <th className="py-2 pr-3 font-medium">{t('employee.firstName')}</th>
              <th className="py-2 pr-3 font-medium">{t('employee.department')}</th>
              <th className="py-2 pr-3 font-medium">{t('employee.position')}</th>
              <th className="py-2 pr-3 font-medium">{t('employee.phone')}</th>
              <th className="py-2 font-medium">{t('employee.status')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-b border-line last:border-0 hover:bg-canvas dark:border-night-line dark:hover:bg-night-line" data-testid="employee-row">
                <td className="py-3 pr-3 tabular-nums text-ink-muted">{e.employeeCode}</td>
                <td className="py-3 pr-3">
                  <Link href={`/employees/${e.id}`} className="font-medium text-ink hover:text-primary dark:text-night-ink">
                    {e.firstName} {e.lastName}
                  </Link>
                  {e.nationalityType === 'FOREIGN' && (
                    <Badge tone="primary" className="ml-2">
                      {t('nationality.FOREIGN')}
                    </Badge>
                  )}
                </td>
                <td className="py-3 pr-3 text-ink-muted">{e.department?.name ?? '—'}</td>
                <td className="py-3 pr-3 text-ink-muted">{e.position?.name ?? '—'}</td>
                <td className="py-3 pr-3 tabular-nums text-ink-muted">{e.phone ?? '—'}</td>
                <td className="py-3">
                  <StatusBadge status={e.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col divide-y divide-line dark:divide-night-line md:hidden">
        {items.map((e) => (
          <li key={e.id} data-testid="employee-card">
            <Link href={`/employees/${e.id}`} className="flex items-center gap-3 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                {e.firstName.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink dark:text-night-ink">
                  {e.firstName} {e.lastName}
                </span>
                <span className="block truncate text-xs text-ink-muted tabular-nums">
                  {e.employeeCode} · {e.position?.name ?? '—'}
                </span>
              </span>
              <StatusBadge status={e.status} />
              <Icon name="chevron_right" className="text-ink-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
