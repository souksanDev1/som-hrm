'use client';
import { PERMISSIONS } from '@hrm/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Field, Input, QueryState } from '@/components/ui';
import { EmployeeSelect } from '@/features/attendance-requests/components/EmployeeSelect';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { useHasPermission } from '@/features/auth/store';
import { leavePolicyApi } from '@/features/leave-policy/api';
import { LeaveAdjustForm } from '@/features/leave-policy/components/LeaveAdjustForm';
import { LeaveBalanceTable } from '@/features/leave-policy/components/LeaveBalanceTable';
import { LeaveLedgerTable } from '@/features/leave-policy/components/LeaveLedgerTable';
import { useLeaveBalances, useLeaveLedger, useLeavePolicyMutation, useLeaveTypes } from '@/features/leave-policy/hooks';
import { useT } from '@/lib/i18n';

/** HR view of one employee's leave balances and ledger for a year, with adjustments (FR-LV-07). */
function LeaveLedgerView() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const employeeId = params.get('employeeId') ?? '';
  const year = Number(params.get('year')) || new Date().getFullYear();
  const canAdjust = useHasPermission(PERMISSIONS.LEAVE_LEDGER_ADJUST);
  const types = useLeaveTypes();
  const balances = useLeaveBalances({ employeeId, year });
  const ledger = useLeaveLedger({ employeeId, year });
  const adjust = useLeavePolicyMutation(leavePolicyApi.adjust);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/leave/ledger?${next.toString()}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('lvp.ledger.title')} description={t('lvp.ledger.subtitle')} />
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('lvp.ledger.employee')} htmlFor="ledger-employee" required>
            <EmployeeSelect id="ledger-employee" value={employeeId} onChange={(id) => setParam('employeeId', id)} />
          </Field>
          <Field label={t('lvp.ledger.year')} htmlFor="ledger-year">
            <Input id="ledger-year" type="number" min={2000} max={2100} value={year} onChange={(e) => e.target.value && setParam('year', e.target.value)} />
          </Field>
        </div>
      </Card>
      {!employeeId ? (
        <Card>
          <p className="text-sm text-ink-muted" data-testid="leave-ledger-choose">{t('lvp.ledger.chooseEmployee')}</p>
        </Card>
      ) : (
        <QueryState query={types}>
          {(allTypes) => (
            <div className="flex flex-col gap-4">
              <Card>
                <h2 className="mb-2 text-sm font-semibold text-ink dark:text-night-ink">{t('lvp.ledger.balances')}</h2>
                <QueryState query={balances}>{(data) => <LeaveBalanceTable balances={data.balances} types={allTypes} />}</QueryState>
              </Card>
              {canAdjust && (
                <Card>
                  <h2 className="mb-2 text-sm font-semibold text-ink dark:text-night-ink">{t('lvp.ledger.adjust')}</h2>
                  <LeaveAdjustForm key={`${employeeId}-${year}`} employeeId={employeeId} year={year} types={allTypes} onSubmit={(body) => adjust.mutateAsync(body)} />
                </Card>
              )}
              <Card>
                <h2 className="mb-2 text-sm font-semibold text-ink dark:text-night-ink">{t('lvp.ledger.entries')}</h2>
                <QueryState query={ledger}>{(entries) => <LeaveLedgerTable entries={entries} types={allTypes} />}</QueryState>
              </Card>
            </div>
          )}
        </QueryState>
      )}
    </div>
  );
}

export default function LeaveLedgerPage() {
  return (
    <RequirePermission permission={PERMISSIONS.LEAVE_MANAGE}>
      <Suspense>
        <LeaveLedgerView />
      </Suspense>
    </RequirePermission>
  );
}
