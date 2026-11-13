'use client';
import { EMPLOYMENT_STATUSES, PERMISSIONS, type EmploymentStatus, type NationalityType } from '@hrm/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Button, Card, Input, Pagination, QueryState, Select } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { useHasPermission } from '@/features/auth/store';
import { EmployeeList } from '@/features/employees/components/EmployeeList';
import { useEmployees } from '@/features/employees/hooks';
import { useT } from '@/lib/i18n';

const PAGE_SIZE = 20;

function EmployeesView() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const canWrite = useHasPermission(PERMISSIONS.EMPLOYEE_WRITE);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [debounced, setDebounced] = useState(search);
  const status = (params.get('status') ?? '') as EmploymentStatus | '';
  const nationalityType = (params.get('nationalityType') ?? '') as NationalityType | '';
  const page = Number(params.get('page') ?? 1);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    router.replace(`/employees?${next.toString()}`);
  };

  const query = useEmployees({
    page,
    pageSize: PAGE_SIZE,
    search: debounced || undefined,
    status: status || undefined,
    nationalityType: nationalityType || undefined,
  });

  return (
    <>
      <PageHeader
        title={t('nav.employees')}
        actions={canWrite && <Link href="/employees/new"><Button icon="person_add" data-testid="new-employee">{t('employee.add')}</Button></Link>}
      />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Input type="search" aria-label={t('common.search')} placeholder={`${t('common.search')}…`} value={search} onChange={(e) => setSearch(e.target.value)} className="sm:col-span-2" data-testid="employee-search" />
          <Select aria-label={t('employee.status')} placeholder={t('employee.status')} value={status} onChange={(e) => setParam('status', e.target.value)} options={EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />
        </div>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
          {(data) => (
            <>
              <EmployeeList items={data.items} />
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => setParam('page', String(p))} labels={{ previous: t('common.previous'), next: t('common.next') }} />
            </>
          )}
        </QueryState>
      </Card>
    </>
  );
}

export default function EmployeesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.EMPLOYEE_READ}>
      <Suspense>
        <EmployeesView />
      </Suspense>
    </RequirePermission>
  );
}
