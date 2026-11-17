'use client';
import type { Shift } from '@hrm/shared';
import { Badge, Button, StateView } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';
import { ShiftSwatch } from './ShiftSwatch';

export interface ShiftListProps {
  shifts: readonly Shift[];
  onEdit?(shift: Shift): void;
  onDelete?(shift: Shift): void;
}

/** Shift definitions: colour, times, night/inactive badges, break and grace overrides (FR-ATT-17.1/17.2). */
export function ShiftList({ shifts, onEdit, onDelete }: ShiftListProps) {
  const t = useT();
  if (shifts.length === 0) return <StateView kind="empty" title={t('common.empty')} />;
  const grace = (v: number | null) => (v === null ? t('shifts.graceDefault') : fill(t('attreport.minutes'), { n: v }));
  return (
    <ul className="flex flex-col divide-y divide-line dark:divide-night-line" data-testid="shift-list">
      {shifts.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5" data-testid="shift-row">
          <ShiftSwatch shift={s} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink dark:text-night-ink">{s.name}</span>
            <span className="block text-xs text-ink-muted">
              {`${t('shifts.grace')}: ${grace(s.lateGraceMinutes)} / ${grace(s.earlyGraceMinutes)} · ${t('shifts.breakMinutes')}: ${s.breakMinutes}`}
            </span>
          </span>
          <span className="text-sm tabular-nums text-ink dark:text-night-ink">{`${s.startTime}–${s.endTime}`}</span>
          <span className="text-xs text-ink-muted">{fill(t('shifts.net'), { hours: Math.round((s.netMinutes / 60) * 10) / 10 })}</span>
          <span className="flex flex-wrap gap-1">
            {s.crossesMidnight && <Badge tone="primary">{t('shifts.night')}</Badge>}
            {!s.isActive && <Badge tone="danger">{t('shifts.inactive')}</Badge>}
            {s.inUse && <Badge>{t('shifts.inUse')}</Badge>}
          </span>
          {(onEdit || onDelete) && (
            <span className="flex gap-1">
              {onEdit && <Button size="sm" variant="ghost" icon="edit" aria-label={`${t('common.edit')} ${s.name}`} onClick={() => onEdit(s)} />}
              {onDelete && <Button size="sm" variant="ghost" icon="delete" aria-label={`${t('common.delete')} ${s.name}`} onClick={() => onDelete(s)} />}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
