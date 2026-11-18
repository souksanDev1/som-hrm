'use client';
import { interpolate, type LeaveBalance, type LeaveRequest, type LeaveType, type RequestStatus } from '@hrm/shared';
import Link from 'next/link';
import { Badge, type BadgeTone } from '@/components/ui';
import { useT, usePrefsStore } from '@/lib/i18n';

export const LEAVE_STATUS_TONE: Record<RequestStatus, BadgeTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' };

/** Leave type name in the UI language. */
export const useLeaveTypeName = () => {
  const locale = usePrefsStore((s) => s.locale);
  return (type: Pick<LeaveType, 'nameLo' | 'nameEn'>) => (locale === 'en' ? type.nameEn : type.nameLo);
};

/** "2030-12-03" or "2030-12-03 – 2030-12-05" plus the half-day part. */
export const usePeriodLabel = () => {
  const t = useT();
  return (r: Pick<LeaveRequest, 'startDate' | 'endDate' | 'halfDay'>) =>
    `${r.startDate === r.endDate ? r.startDate : `${r.startDate} – ${r.endDate}`}${r.halfDay !== 'NONE' ? ` · ${t(`leave.halfDay.${r.halfDay}`)}` : ''}`;
};

export interface LeaveBalanceListProps {
  year: number;
  balances: readonly LeaveBalance[];
  types: readonly LeaveType[];
}

/** Yearly balances from the ledger (FR-LV-06.2 / 07): remaining days with entitled, used and pending. */
export function LeaveBalanceList({ year, balances, types }: LeaveBalanceListProps) {
  const t = useT();
  const typeName = useLeaveTypeName();
  const rows = balances.filter((b) => b.quotaPeriod === 'YEARLY');
  return (
    <section data-testid="leave-balances">
      <h2 className="mb-2 text-sm font-semibold text-ink dark:text-night-ink">{interpolate(t('lvr.balances.title'), { year })}</h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((b) => {
          const type = types.find((x) => x.id === b.leaveTypeId);
          return (
            <li key={b.leaveTypeId} className="rounded-sm border border-line p-3 dark:border-night-line" data-testid={`leave-balance-${type?.code ?? b.leaveTypeId}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink dark:text-night-ink">{type ? typeName(type) : '—'}</span>
                <span className="text-lg font-semibold tabular-nums text-ink dark:text-night-ink" data-testid="leave-balance-remaining">
                  {b.balance}
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                {`${t('lvr.balance.entitled')} ${b.entitled + b.carried + b.adjusted} · ${t('lvr.balance.used')} ${b.used} · ${t('lvr.balance.pending')} ${b.pending}`}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Leave requests with period, type, days and status; each row opens the request detail. */
export function LeaveRequestList({ items, showEmployee }: { items: readonly LeaveRequest[]; showEmployee?: boolean }) {
  const t = useT();
  const typeName = useLeaveTypeName();
  const period = usePeriodLabel();
  if (!items.length) return <p className="text-sm text-ink-muted" data-testid="leave-empty">{t('lvr.requests.empty')}</p>;
  return (
    <ul className="divide-y divide-line dark:divide-night-line" data-testid="leave-list">
      {items.map((r) => (
        <li key={r.id} data-testid="leave-item">
          <Link href={`/leave/${r.id}`} className="flex flex-wrap items-start justify-between gap-2 py-3 hover:bg-canvas dark:hover:bg-night-line">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink dark:text-night-ink">
                {typeName(r.leaveType)}
                {showEmployee && <span className="ml-2 text-ink-muted">{`${r.employeeCode} ${r.employeeName}`}</span>}
              </p>
              <p className="text-xs text-ink-muted">{period(r)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-ink dark:text-night-ink">{interpolate(t('leave.days'), { days: r.days })}</span>
              <Badge tone={LEAVE_STATUS_TONE[r.status]}>{t(`approval.status.${r.status}`)}</Badge>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
