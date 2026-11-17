import {
  addDays,
  capStatus,
  localDateTimeOf,
  periodOverlap,
  scheduledWindow,
  splitOvertime,
  totalOvertimeMinutes,
  type CapStatus,
  type OvertimeSplit,
  type Period,
} from '@hrm/shared';
import type { Tx } from '../../db/client';
import { parseIsoDate } from '../../lib/dates';
import { conflict } from '../../lib/errors';
import { loadEmployeeDays, type EmployeeDay } from '../attendance/day-context';
import { parameterReader } from '../parameters/parameters.service';
import { monthRange, overtimeRepository as repo } from './overtime.repository';

/** Local dates a period touches (start date … end date). */
const datesOf = (period: Period, timeZone: string): string[] => {
  const last = localDateTimeOf(new Date(period.end.getTime() - 1), timeZone).date;
  const out: string[] = [];
  for (let d = localDateTimeOf(period.start, timeZone).date; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
};

/**
 * Split a period into the four OT categories (FR-ATT-21) for one employee: the night window comes from
 * `ot.nightStart`/`ot.nightEnd`; a date counts as a holiday when it is one *for this employee* (8 March women only,
 * foreign national days — `loadEmployeeDays`) or, with `ot.restDayCountsAsHoliday`, their weekly rest day.
 * Parameters are read as of `workDate`.
 */
export const splitForEmployee = async (
  tx: Tx,
  workspaceId: string,
  employeeId: string,
  workDate: string,
  period: Period,
  timeZone: string,
  days?: Map<string, EmployeeDay>,
): Promise<OvertimeSplit> => {
  const at = parseIsoDate(workDate);
  const [nightStart, nightEnd, restDayCounts] = await Promise.all([
    parameterReader.workspace(tx, workspaceId, 'ot.nightStart', at),
    parameterReader.workspace(tx, workspaceId, 'ot.nightEnd', at),
    parameterReader.workspace(tx, workspaceId, 'ot.restDayCountsAsHoliday', at),
  ]);
  const dates = datesOf(period, timeZone);
  const byDate = days && dates.every((d) => days.has(d)) ? days : await loadEmployeeDays(tx, workspaceId, employeeId, dates);
  return splitOvertime(period.start, period.end, {
    timeZone,
    night: { start: nightStart, end: nightEnd },
    isHolidayOn: (date) => {
      const day = byDate.get(date);
      return !!day && (day.isHoliday || (restDayCounts && day.isRestDay));
    },
  });
};

/**
 * OT is time outside normal hours (FR-ATT-20): refuse a period overlapping the scheduled shift of the day before
 * (a night shift running past midnight), the day itself or the next day. Holidays and rest days have no
 * scheduled hours.
 */
const assertOutsideShifts = (period: Period, days: Map<string, EmployeeDay>, timeZone: string) => {
  for (const day of days.values()) {
    if (!day.shift || day.scheduledMinutes === 0 || day.isHoliday) continue;
    const window = scheduledWindow(day.date, day.shift, day.scheduledMinutes, timeZone);
    if (periodOverlap(period, window)) throw conflict('ot_overlaps_shift', { date: day.date, start: window.start.toISOString(), end: window.end.toISOString() });
  }
};

export interface OvertimeEvaluation extends OvertimeSplit {
  minutes: number;
  day: CapStatus;
  month: CapStatus;
  warnPercent: number;
}

/**
 * Everything the preview and the filing need for one period: overlap checks (shift, other requests), the
 * category split, and the day / calendar-month caps counting pending + approved requests plus this one
 * (`ot.maxMinutesPerDay`, `ot.maxMinutesPerMonth`, warning at `ot.warnPercent`, FR-ATT-22).
 */
export const evaluateOvertime = async (
  tx: Tx,
  workspaceId: string,
  employeeId: string,
  workDate: string,
  period: Period,
  timeZone: string,
  excludeId?: string,
): Promise<OvertimeEvaluation> => {
  const at = parseIsoDate(workDate);
  const dates = [...new Set([addDays(workDate, -1), ...datesOf(period, timeZone), addDays(workDate, 1)])];
  const days = await loadEmployeeDays(tx, workspaceId, employeeId, dates);
  assertOutsideShifts(period, days, timeZone);
  if (await repo.findOverlapping(tx, workspaceId, employeeId, period.start, period.end, excludeId)) throw conflict('ot_overlaps_request');

  const split = await splitForEmployee(tx, workspaceId, employeeId, workDate, period, timeZone, days);
  const minutes = totalOvertimeMinutes(split);
  const { from, to } = monthRange(workDate.slice(0, 7));
  const [maxDay, maxMonth, warnPercent, usedDay, usedMonth] = await Promise.all([
    parameterReader.workspace(tx, workspaceId, 'ot.maxMinutesPerDay', at),
    parameterReader.workspace(tx, workspaceId, 'ot.maxMinutesPerMonth', at),
    parameterReader.workspace(tx, workspaceId, 'ot.warnPercent', at),
    repo.usedMinutes(tx, workspaceId, employeeId, at, at, excludeId),
    repo.usedMinutes(tx, workspaceId, employeeId, from, to, excludeId),
  ]);
  return {
    ...split,
    minutes,
    day: capStatus(usedDay, minutes, maxDay, warnPercent),
    month: capStatus(usedMonth, minutes, maxMonth, warnPercent),
    warnPercent,
  };
};
