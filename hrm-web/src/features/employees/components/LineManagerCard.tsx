'use client';
import type { EmployeeDetail } from '@hrm/shared';
import { Card } from '@/components/ui';
import { useT } from '@/lib/i18n';

/** Department and line manager (or "top level, requests go to HR") of one employee. */
export function LineManagerCard({ manager, isTopLevel, department }: Pick<EmployeeDetail, 'manager' | 'isTopLevel' | 'department'>) {
  const t = useT();
  return (
    <Card title={t('employee.lineManager')}>
      <div data-testid="line-manager" className="flex flex-col gap-3">
        {department && (
          <p className="text-sm text-ink-muted">
            {t('employee.department')}: <span className="text-ink dark:text-night-ink">{department.name}</span>
          </p>
        )}
        {manager ? (
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
            >
              {manager.name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink dark:text-night-ink">{manager.name}</p>
              {manager.positionName && <p className="truncate text-xs text-ink-muted">{manager.positionName}</p>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t(isTopLevel ? 'employee.topLevelInfo' : 'employee.managerMissing')}</p>
        )}
      </div>
    </Card>
  );
}
