/**
 * Leave calendar (FR-LV-13): pure date helpers shared by the API (range limit) and the web/mobile views
 * (today / week / month). Visibility rules live in the API; clients only lay out what it returns.
 * Dates are ISO calendar dates (YYYY-MM-DD) in the workspace time zone; weeks start on Monday.
 */
import { addDays } from './attendance';
import { calendarDaysInclusive, datesInRange } from './leave';
import { weekdayOf } from './work-schedule';

/** Longest range one calendar request may cover, in calendar days (a 6-week month grid is 42). */
export const LEAVE_CALENDAR_MAX_DAYS = 62;

export const LEAVE_CALENDAR_VIEWS = ['today', 'week', 'month'] as const;
export type LeaveCalendarView = (typeof LEAVE_CALENDAR_VIEWS)[number];

export interface CalendarRange {
  from: string;
  to: string;
}

/** True when `from..to` (inclusive) is longer than {@link LEAVE_CALENDAR_MAX_DAYS}. */
export const leaveCalendarRangeTooLong = (from: string, to: string): boolean => calendarDaysInclusive(from, to) > LEAVE_CALENDAR_MAX_DAYS;

/** Monday of the week containing `date`. */
export const startOfWeek = (date: string): string => addDays(date, -((weekdayOf(date) + 6) % 7));

/** The seven dates (Mon..Sun) of the week containing `date`. */
export const weekDates = (date: string): string[] => datesInRange(startOfWeek(date), addDays(startOfWeek(date), 6));

/** `YYYY-MM` → last day of that month. */
const endOfMonth = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/**
 * Month grid for `month` (YYYY-MM): whole Monday-to-Sunday weeks covering the first to the last day of the month
 * (4–6 rows of 7 dates). Dates outside the month are included so the grid is rectangular.
 */
export const monthGrid = (month: string): string[][] => {
  const first = `${month}-01`;
  const start = startOfWeek(first);
  const last = endOfMonth(month);
  const end = addDays(startOfWeek(last), 6);
  const dates = datesInRange(start, end);
  const weeks: string[][] = [];
  for (let i = 0; i < dates.length; i += 7) weeks.push(dates.slice(i, i + 7));
  return weeks;
};

/** Range the API is asked for to draw `view` around `anchor` (a date; the month of it for 'month'). */
export const leaveCalendarRange = (view: LeaveCalendarView, anchor: string): CalendarRange => {
  if (view === 'today') return { from: anchor, to: anchor };
  if (view === 'week') {
    const days = weekDates(anchor);
    return { from: days[0]!, to: days[6]! };
  }
  const weeks = monthGrid(anchor.slice(0, 7));
  return { from: weeks[0]![0]!, to: weeks[weeks.length - 1]![6]! };
};

/** Anchor of the previous (`-1`) / next (`1`) period: a day, a week, or the first of the month. */
export const shiftLeaveCalendarAnchor = (view: LeaveCalendarView, anchor: string, step: -1 | 1): string => {
  if (view === 'today') return addDays(anchor, step);
  if (view === 'week') return addDays(anchor, 7 * step);
  const [y, m] = anchor.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + step, 1)).toISOString().slice(0, 10);
};

/** The entries (anything with an inclusive start/end date) that cover `date`. */
export const entriesOnDate = <T extends { startDate: string; endDate: string }>(entries: readonly T[], date: string): T[] =>
  entries.filter((e) => e.startDate <= date && e.endDate >= date);

/** Everything a calendar cell shows for `date`: who is off, the holidays and whether it is a weekly rest day. */
export const leaveCalendarDay = <E extends { startDate: string; endDate: string }, H extends { date: string }>(
  data: { entries: readonly E[]; holidays: readonly H[]; restDays: readonly string[] },
  date: string,
): { date: string; entries: E[]; holidays: H[]; isRestDay: boolean } => ({
  date,
  entries: entriesOnDate(data.entries, date),
  holidays: data.holidays.filter((h) => h.date === date),
  isRestDay: data.restDays.includes(date),
});
