'use client';
import type { LeaveLedgerEntry, LeaveType } from '@hrm/shared';
import { useT } from '@/lib/i18n';
import { useLeaveTypeName } from '../hooks';

/** Every movement of an employee's leave balance with who posted it (FR-LV-07.3 audit view). */
export function LeaveLedgerTable({ entries, types }: { entries: readonly LeaveLedgerEntry[]; types: readonly LeaveType[] }) {
  const t = useT();
  const name = useLeaveTypeName();
  if (!entries.length) return <p className="text-sm text-ink-muted" data-testid="leave-ledger-empty">{t('lvp.ledger.empty')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm" data-testid="leave-ledger-table">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted dark:border-night-line">
            <th className="px-3 py-2 font-medium">{t('lvp.ledger.date')}</th>
            <th className="px-3 py-2 font-medium">{t('lvp.ledger.type')}</th>
            <th className="px-3 py-2 font-medium">{t('lvp.ledger.kind')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('lvp.ledger.days')}</th>
            <th className="px-3 py-2 font-medium">{t('lvp.ledger.reason')}</th>
            <th className="px-3 py-2 font-medium">{t('lvp.ledger.by')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-line dark:border-night-line" data-testid="leave-ledger-row">
              <td className="px-3 py-2 tabular-nums">{e.effectiveDate}</td>
              <td className="px-3 py-2">{name(types.find((x) => x.id === e.leaveTypeId))}</td>
              <td className="px-3 py-2">{t(`leave.ledger.${e.kind}`)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${e.days < 0 ? 'text-danger' : 'text-success'}`}>{e.days > 0 ? `+${e.days}` : e.days}</td>
              <td className="px-3 py-2 text-ink-muted">{e.reason ?? ''}</td>
              <td className="px-3 py-2 text-ink-muted">{e.createdByName ?? t('lvp.ledger.system')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
