'use client';
import type { Holiday } from '@hrm/shared';
import { Badge, Button, StateView, type BadgeTone } from '@/components/ui';
import { useT, usePrefsStore } from '@/lib/i18n';

const KIND_TONE: Record<Holiday['kind'], BadgeTone> = { PUBLIC: 'primary', TRADITIONAL: 'success', SUBSTITUTE: 'warning', NATIONAL_DAY: 'neutral' };

export interface HolidayListProps {
  holidays: readonly Holiday[];
  canEdit?: boolean;
  onEdit?(holiday: Holiday): void;
  onDelete?(holiday: Holiday): void;
}

/** One year of the holiday calendar: date, localized name, type and who gets the day off. */
export function HolidayList({ holidays, canEdit = false, onEdit, onDelete }: HolidayListProps) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  if (holidays.length === 0) return <StateView kind="empty" title={t('common.empty')} />;
  const weekday = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === 'lo' ? 'lo-LA' : 'en-GB', { weekday: 'short', timeZone: 'UTC' });

  return (
    <ul className="flex flex-col divide-y divide-line dark:divide-night-line" data-testid="holiday-list">
      {holidays.map((h) => {
        const name = locale === 'lo' ? h.nameLo : h.nameEn;
        return (
          <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5" data-testid="holiday-row">
            <span className="w-28 shrink-0 text-sm tabular-nums text-ink dark:text-night-ink">
              {h.date} <span className="text-xs text-ink-muted">{weekday(h.date)}</span>
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-ink dark:text-night-ink">{name}</span>
            <span className="flex flex-wrap gap-1">
              <Badge tone={KIND_TONE[h.kind]}>{t(`holiday.kind.${h.kind}`)}</Badge>
              {h.womenOnly && <Badge tone="danger">{t('holiday.womenOnly')}</Badge>}
              {h.nationality && <Badge>{`${t('holiday.nationality')}: ${h.nationality}`}</Badge>}
              {h.isDefault && <Badge>{t('holiday.default')}</Badge>}
            </span>
            {canEdit && (
              <span className="flex gap-1">
                {onEdit && <Button size="sm" variant="ghost" icon="edit" aria-label={`${t('common.edit')} ${name}`} onClick={() => onEdit(h)} />}
                {onDelete && <Button size="sm" variant="ghost" icon="delete" aria-label={`${t('common.delete')} ${name}`} onClick={() => onDelete(h)} />}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
