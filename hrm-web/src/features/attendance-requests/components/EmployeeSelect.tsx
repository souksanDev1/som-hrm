'use client';
import { useState, type ReactNode } from 'react';
import { Input, Select } from '@/components/ui';
import { useEmployees } from '@/features/employees/hooks';
import { useT } from '@/lib/i18n';

export interface EmployeeSelectProps {
  id: string;
  value: string;
  onChange(employeeId: string): void;
  invalid?: boolean;
}

/** Search + single choice of an employee within the caller's data scope (the API filters the list). */
export function EmployeeSelect({ id, value, onChange, invalid }: EmployeeSelectProps) {
  const t = useT();
  const [search, setSearch] = useState('');
  const query = useEmployees({ search: search.trim() || undefined, page: 1, pageSize: 50 });
  const options = (query.data?.items ?? []).map((e) => ({ value: e.id, label: `${e.employeeCode} · ${e.firstName} ${e.lastName}` }));
  return (
    <div className="flex flex-col gap-2">
      <Input type="search" aria-label={t('common.search')} placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <Select id={id} value={value} invalid={invalid} placeholder={t('attreq.onBehalf.pickEmployee')} options={options} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Lets forms swap the hook-backed picker for a plain one (tests). */
export type RenderEmployeeSelect = (props: EmployeeSelectProps) => ReactNode;
export const defaultEmployeeSelect: RenderEmployeeSelect = (props) => <EmployeeSelect {...props} />;
