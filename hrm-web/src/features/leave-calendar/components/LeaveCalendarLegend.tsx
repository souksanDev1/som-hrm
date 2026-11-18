'use client';
import type { LeaveCalendarViewer } from '@hrm/shared';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { STATUS_CLASS } from './LeaveEntryChip';

/** Colour legend (FR-LV-13.7/13.8); "pending" only appears for viewers who can see pending requests. */
export function LeaveCalendarLegend({ viewer }: { viewer: Pick<LeaveCalendarViewer, 'canSeePending'> }) {
  const t = useT();
  const items: { key: string; label: string; className: string }[] = [
    { key: 'approved', label: t('lcal.status.APPROVED'), className: STATUS_CLASS.APPROVED! },
    ...(viewer.canSeePending ? [{ key: 'pending', label: t('lcal.status.PENDING'), className: STATUS_CLASS.PENDING! }] : []),
    { key: 'holiday', label: t('lcal.holiday'), className: 'border-danger/30 bg-danger-soft' },
    { key: 'rest', label: t('lcal.restDay'), className: 'border-line bg-canvas dark:bg-night-canvas' },
  ];
  return (
    <ul data-testid="lcal-legend" aria-label={t('lcal.legend')} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
      {items.map((i) => (
        <li key={i.key} data-testid={`lcal-legend-${i.key}`} className="flex items-center gap-1.5">
          <span className={cn('inline-block h-3 w-3 rounded-sm border', i.className)} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
