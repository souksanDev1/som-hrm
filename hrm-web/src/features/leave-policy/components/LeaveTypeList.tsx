'use client';
import type { LeaveType } from '@hrm/shared';
import { Badge, Button } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';
import { useLeaveTypeName } from '../hooks';
import { LegalMinimum } from './LegalMinimum';

export interface LeaveTypeListProps {
  types: readonly LeaveType[];
  onEdit(type: LeaveType): void;
}

/** Leave types with their quota, days, legal minimum and flags (FR-LV-01/02). */
export function LeaveTypeList({ types, onEdit }: LeaveTypeListProps) {
  const t = useT();
  const name = useLeaveTypeName();
  if (!types.length) return <p className="text-sm text-ink-muted">{t('lvp.types.empty')}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line dark:divide-night-line">
      {types.map((lt) => (
        <li key={lt.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="leave-type-row">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink dark:text-night-ink">{name(lt)}</span>
              <span className="text-xs text-ink-muted">{lt.code}</span>
              <Badge tone={lt.isCustom ? 'primary' : 'neutral'}>{t(lt.isCustom ? 'lvp.types.custom' : 'lvp.types.statutory')}</Badge>
              {!lt.isActive && <Badge tone="warning">{t('lvp.types.inactive')}</Badge>}
              {!lt.paid && <Badge>{t('leave.category.UNPAID')}</Badge>}
            </div>
            <p className="text-sm text-ink-muted" data-testid="leave-type-quota">
              {lt.quotaPeriod === 'UNLIMITED'
                ? t('lvp.types.unlimited')
                : `${fill(t('leave.days'), { days: lt.policy.daysPerYear })} ${t(`leave.quota.${lt.quotaPeriod}`)}`}
              {lt.policy.hazardousDays !== null && ` · ${fill(t('lvp.types.legalMinHazardous'), { days: lt.policy.hazardousDays })}`}
              {lt.policy.multipleBirthDays !== null && ` · ${fill(t('lvp.types.legalMinMultiple'), { days: lt.policy.multipleBirthDays })}`}
              {` · ${t(`leave.counting.${lt.countingMethod}`)}`}
            </p>
            <LegalMinimum legalMin={lt.legalMin} />
          </div>
          <Button variant="secondary" size="sm" icon="edit" onClick={() => onEdit(lt)} data-testid="leave-type-edit">
            {t('common.edit')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
