'use client';
import type { RosterCell, RosterView, Shift } from '@hrm/shared';
import { cn } from '@/lib/cn';
import { useT, usePrefsStore } from '@/lib/i18n';
import { dayLabel } from '../format';
import { ShiftSwatch } from './ShiftSwatch';

/** Cell choice: a shift id, a rostered rest day, or back to the work schedule (clears the roster row). */
export const ROSTER_REST = 'REST';
export const ROSTER_SCHEDULE = 'SCHEDULE';
export type RosterChoice = string;

export interface RosterGridProps {
  roster: RosterView;
  /** Active shifts offered in each cell. */
  shifts: readonly Shift[];
  /** All shifts (incl. inactive) to label cells that still use one. */
  allShifts: readonly Shift[];
  dates: readonly string[];
  /** Omit for a read-only grid. */
  onChange?(employeeId: string, date: string, choice: RosterChoice): void;
  disabled?: boolean;
}

/** Week grid of employees × days (FR-ATT-17.3). Schedule-derived cells have a dashed chip. */
export function RosterGrid({ roster, shifts, allShifts, dates, onChange, disabled }: RosterGridProps) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const byKey = new Map<string, RosterCell>(roster.cells.map((c) => [`${c.employeeId}|${c.date}`, c]));
  const shiftById = new Map(allShifts.map((s) => [s.id, s]));

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[720px] text-left text-sm" data-testid="roster-grid">
        <thead className="border-b border-line text-xs text-ink-muted dark:border-night-line">
          <tr>
            <th className="sticky left-0 bg-white py-2 pr-3 font-medium dark:bg-night-surface">{t('roster.employee')}</th>
            {dates.map((d) => (
              <th key={d} className="px-1 py-2 text-center font-medium">{dayLabel(d, locale)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line dark:divide-night-line">
          {roster.employees.map((e) => (
            <tr key={e.id} data-testid="roster-row">
              <td className="sticky left-0 bg-white py-2 pr-3 dark:bg-night-surface">
                <span className="block font-medium text-ink dark:text-night-ink">{e.name}</span>
                <span className="block text-xs text-ink-muted">{e.employeeCode}</span>
              </td>
              {dates.map((d) => {
                const cell = byKey.get(`${e.id}|${d}`);
                const shift = cell?.shiftId ? shiftById.get(cell.shiftId) : undefined;
                const fromSchedule = cell?.source !== 'ROSTER';
                const value = !cell || fromSchedule ? ROSTER_SCHEDULE : (cell.shiftId ?? ROSTER_REST);
                const label = `${e.name} ${d}`;
                return (
                  <td key={d} className="px-1 py-1.5 text-center align-middle">
                    <div className="flex flex-col items-center gap-1">
                      {shift ? (
                        <ShiftSwatch shift={shift} dashed={fromSchedule} />
                      ) : (
                        <span className={cn('text-xs text-ink-muted', fromSchedule && 'italic')}>{t('roster.rest')}</span>
                      )}
                      {onChange && (
                        <select
                          aria-label={label}
                          data-testid={`roster-cell-${e.employeeCode}-${d}`}
                          className="w-full max-w-[7rem] rounded border border-line bg-white px-1 py-0.5 text-xs dark:border-night-line dark:bg-night-surface"
                          value={value}
                          disabled={disabled}
                          onChange={(ev) => onChange(e.id, d, ev.target.value)}
                        >
                          <option value={ROSTER_SCHEDULE}>{t('roster.fromSchedule')}</option>
                          <option value={ROSTER_REST}>{t('roster.rest')}</option>
                          {shifts.map((s) => (
                            <option key={s.id} value={s.id}>{s.code ? `${s.code} · ${s.name}` : s.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
