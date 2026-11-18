'use client';
import type { ApprovalTeamLeave } from '@hrm/shared';
import { Badge } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';

export interface TeamOnLeaveProps {
  members: readonly ApprovalTeamLeave[];
}

/** Team members on leave on overlapping dates, shown to approvers of a leave request (FR-LV-13.10). */
export function TeamOnLeave({ members }: TeamOnLeaveProps) {
  const t = useT();
  if (!members.length) {
    return (
      <p className="text-sm text-ink-muted" data-testid="team-on-leave-empty">
        {t('approval.teamOnLeave.empty')}
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-line dark:divide-night-line" data-testid="team-on-leave">
      {members.map((m) => (
        <li key={m.requestId} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="team-on-leave-item">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-ink dark:text-night-ink">
              {m.name} · {m.employeeCode}
            </span>
            <span className="text-xs text-ink-muted">
              {m.startDate === m.endDate ? m.startDate : `${m.startDate} – ${m.endDate}`}
              {m.halfDay !== 'NONE' && ` (${t(`leave.halfDay.${m.halfDay}`)})`} · {fill(t('leave.days'), { days: m.days })}
            </span>
          </div>
          {m.status === 'PENDING' && <Badge tone="warning">{t('approval.teamOnLeave.pending')}</Badge>}
        </li>
      ))}
    </ul>
  );
}
