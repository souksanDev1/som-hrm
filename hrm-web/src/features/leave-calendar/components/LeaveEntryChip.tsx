'use client';
import type { LeaveCalendarEntry } from '@hrm/shared';
import { cn } from '@/lib/cn';
import { usePrefsStore, useT } from '@/lib/i18n';
import { localName } from '../format';

/** Status colours (FR-LV-13.7): approved = green, pending = amber with a dashed border. */
export const STATUS_CLASS: Record<string, string> = {
  APPROVED: 'border-success/30 bg-success-soft text-success',
  PENDING: 'border-dashed border-warning/60 bg-warning-soft text-warning',
};

/**
 * One person's leave on a day: name, half-day part (FR-LV-13.2) and — when the viewer may see it — the leave type
 * (FR-LV-13.6). `compact` keeps it to one line for grid cells.
 */
export function LeaveEntryChip({ entry, compact = false }: { entry: LeaveCalendarEntry; compact?: boolean }) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const half = entry.halfDay !== 'NONE' ? t(`leave.halfDay.${entry.halfDay}`) : null;
  const type = entry.leaveType ? localName(entry.leaveType, locale) : null;
  const title = [entry.employeeName, type ?? t('lcal.onLeave'), half, t(`lcal.status.${entry.status}`)].filter(Boolean).join(' · ');
  return (
    <div
      data-testid="lcal-entry"
      data-status={entry.status}
      data-half={entry.halfDay}
      title={title}
      className={cn('min-w-0 rounded-sm border px-1.5 py-0.5 text-xs', STATUS_CLASS[entry.status] ?? STATUS_CLASS.APPROVED)}
    >
      <span className="block truncate font-medium text-ink dark:text-night-ink">
        {entry.employeeName}
        {half && compact && <span className="ml-1 font-normal text-ink-muted">½</span>}
      </span>
      {!compact && (
        <span className="block truncate">
          {[type ?? t('lcal.onLeave'), half].filter(Boolean).join(' · ')}
          {entry.status === 'PENDING' && <span data-testid="lcal-entry-pending"> · {t('lcal.status.PENDING')}</span>}
        </span>
      )}
    </div>
  );
}
