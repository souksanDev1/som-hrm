'use client';
import { PERMISSIONS } from '@hrm/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Card, Field, Input, QueryState, Select } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { OvertimeReportTable } from '@/features/overtime/components/OvertimeReportTable';
import { OvertimeRequestList } from '@/features/overtime/components/OvertimeRequestList';
import { localToday, useOvertimeReport } from '@/features/overtime/hooks';
import { useT } from '@/lib/i18n';

/** Monthly OT by employee and category for HR / managers within their data scope (FR-ATT-21, payroll input). */
function OvertimeReportView() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const month = params.get('month') ?? localToday().slice(0, 7);
  const employeeId = params.get('employeeId') ?? '';
  const query = useOvertimeReport(month, employeeId || undefined);
  // Employee filter options: everyone with a request this month (kept while one employee is selected).
  const everyone = useOvertimeReport(month);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/overtime/report?${next.toString()}`);
  };
  const employees = [...new Map((everyone.data?.items ?? []).map((i) => [i.employeeId, `${i.employeeCode} ${i.employeeName}`])).entries()];

  return (
    <>
      <PageHeader title={t('otx.report.title')} description={t('otx.report.subtitle')} />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label={t('otx.month')} htmlFor="ot-report-month">
            <Input id="ot-report-month" type="month" value={month} onChange={(e) => e.target.value && setParam('month', e.target.value)} />
          </Field>
          <Field label={t('otx.report.employee')} htmlFor="ot-report-employee">
            <Select
              id="ot-report-employee"
              placeholder={t('otx.report.all')}
              value={employeeId}
              onChange={(e) => setParam('employeeId', e.target.value)}
              options={employees.map(([value, label]) => ({ value, label }))}
            />
          </Field>
        </div>
        <QueryState query={query}>
          {(data) => (
            <div className="flex flex-col gap-6">
              {data.rows.length ? <OvertimeReportTable report={data} /> : <p className="text-sm text-ink-muted" data-testid="ot-report-empty">{t('otx.report.empty')}</p>}
              {data.items.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-semibold text-ink dark:text-night-ink">{t('otx.report.requestsTitle')}</h2>
                  <OvertimeRequestList items={data.items} showEmployee />
                </div>
              )}
            </div>
          )}
        </QueryState>
      </Card>
    </>
  );
}

export default function OvertimeReportPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ATTENDANCE_READ_ALL}>
      <Suspense>
        <OvertimeReportView />
      </Suspense>
    </RequirePermission>
  );
}
