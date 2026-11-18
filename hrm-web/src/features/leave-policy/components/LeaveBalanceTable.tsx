'use client';
import type { LeaveBalance, LeaveType } from '@hrm/shared';
import { useT } from '@/lib/i18n';
import { useLeaveTypeName } from '../hooks';

const COLUMNS = ['entitled', 'carried', 'used', 'adjusted', 'expired', 'balance', 'pending'] as const;

/** One employee's balances of a leave year, as computed by the API (`summarizeLedger`, FR-LV-07). */
export function LeaveBalanceTable({ balances, types }: { balances: readonly LeaveBalance[]; types: readonly LeaveType[] }) {
  const t = useT();
  const name = useLeaveTypeName();
  const cell = 'px-3 py-2 text-right tabular-nums';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm" data-testid="leave-balance-table">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted dark:border-night-line">
            <th className="px-3 py-2 text-left font-medium">{t('lvp.ledger.type')}</th>
            {COLUMNS.map((c) => (
              <th key={c} className="px-3 py-2 text-right font-medium">
                {t(`lvp.ledger.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {balances.map((b) => (
            <tr key={b.leaveTypeId} className="border-b border-line dark:border-night-line" data-testid="leave-balance-row">
              <td className="px-3 py-2 text-ink dark:text-night-ink">
                {name(types.find((x) => x.id === b.leaveTypeId))}
                <span className="ml-1 text-xs text-ink-muted">{t(`leave.quota.${b.quotaPeriod}`)}</span>
              </td>
              {COLUMNS.map((c) => (
                <td key={c} className={`${cell} ${c === 'balance' ? 'font-semibold' : ''}`}>
                  {b[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
