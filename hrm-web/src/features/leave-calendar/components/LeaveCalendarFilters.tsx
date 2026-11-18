'use client';
import { Field, Select, type SelectOption } from '@/components/ui';
import { useT } from '@/lib/i18n';

export interface LeaveCalendarFiltersProps {
  departments: readonly SelectOption[];
  leaveTypes: readonly SelectOption[];
  departmentId: string;
  leaveTypeId: string;
  onChange(next: { departmentId: string; leaveTypeId: string }): void;
}

/** Department / leave-type filters (FR-LV-13.5) — rendered only for managers and HR (`viewer.canFilter`). */
export function LeaveCalendarFilters({ departments, leaveTypes, departmentId, leaveTypeId, onChange }: LeaveCalendarFiltersProps) {
  const t = useT();
  return (
    <div data-testid="lcal-filters" className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
      <Field label={t('lcal.filter.department')} htmlFor="lcal-department">
        <Select
          id="lcal-department"
          data-testid="lcal-filter-department"
          value={departmentId}
          placeholder={t('lcal.filter.all')}
          options={departments}
          onChange={(e) => onChange({ departmentId: e.target.value, leaveTypeId })}
        />
      </Field>
      <Field label={t('lcal.filter.leaveType')} htmlFor="lcal-leave-type">
        <Select
          id="lcal-leave-type"
          data-testid="lcal-filter-type"
          value={leaveTypeId}
          placeholder={t('lcal.filter.all')}
          options={leaveTypes}
          onChange={(e) => onChange({ departmentId, leaveTypeId: e.target.value })}
        />
      </Field>
    </div>
  );
}
