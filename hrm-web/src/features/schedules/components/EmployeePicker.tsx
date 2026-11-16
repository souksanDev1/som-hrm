'use client';
import { useState } from 'react';
import { Checkbox, Input, QueryState } from '@/components/ui';
import { useEmployees } from '@/features/employees/hooks';
import { fill } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';

export interface EmployeePickerProps {
  selected: readonly string[];
  onChange(ids: string[]): void;
}

/** Search + multi-select of employees for bulk actions (FR-WS-03.3). Shows up to 100 matches. */
export function EmployeePicker({ selected, onChange }: EmployeePickerProps) {
  const t = useT();
  const [search, setSearch] = useState('');
  const query = useEmployees({ search: search.trim() || undefined, page: 1, pageSize: 100 });
  const toggle = (id: string, on: boolean) => onChange(on ? [...selected, id] : selected.filter((s) => s !== id));

  return (
    <fieldset className="flex flex-col gap-2" data-testid="employee-picker">
      <legend className="mb-1 text-sm font-medium text-ink dark:text-night-ink">
        {t('schedule.overrides.pickEmployees')} <span className="text-danger">*</span>
      </legend>
      <Input
        type="search"
        aria-label={t('common.search')}
        placeholder={t('common.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
        {(data) => {
          const ids = data.items.map((e) => e.id);
          const allOn = ids.every((id) => selected.includes(id));
          return (
            <div className="flex flex-col gap-1">
              <Checkbox
                id="pick-all"
                label={t('schedule.overrides.selectAll')}
                checked={allOn}
                onChange={(e) => onChange(e.target.checked ? [...new Set([...selected, ...ids])] : selected.filter((s) => !ids.includes(s)))}
              />
              <ul className="max-h-48 overflow-y-auto rounded-sm border border-line p-2 dark:border-night-line">
                {data.items.map((e) => (
                  <li key={e.id} className="py-0.5">
                    <Checkbox
                      id={`pick-${e.id}`}
                      label={`${e.employeeCode} · ${e.firstName} ${e.lastName}`}
                      checked={selected.includes(e.id)}
                      onChange={(ev) => toggle(e.id, ev.target.checked)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        }}
      </QueryState>
      <p className="text-xs text-ink-muted" data-testid="picked-count">
        {fill(t('schedule.overrides.selected'), { count: selected.length })}
      </p>
    </fieldset>
  );
}
