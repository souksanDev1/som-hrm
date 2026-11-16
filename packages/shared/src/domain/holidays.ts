/**
 * Holiday calendar rules (FR-WS-04/05). Pure functions: the attendance (M5) and payroll (M6)
 * engines call `holidaysFor` with the workspace calendar to get one employee's days off.
 */
import { HolidayKind, type Gender } from '../enums';
import { LAO_FIXED_HOLIDAYS } from './lao-labor';

/** The fields of a holiday entry the rules need (API rows and `holidaySchema` both fit). */
export interface HolidayRule {
  /** YYYY-MM-DD */
  date: string;
  womenOnly: boolean;
  /** Only employees of this nationality get the day (e.g. a foreign national day); null = everyone. */
  nationality: string | null;
}

export interface HolidayEmployee {
  gender: Gender | string;
  /** Free-text country/nationality from the employee record; null/undefined for most Lao staff. */
  nationality?: string | null;
}

/** Inclusive date range, YYYY-MM-DD. */
export interface DateRange {
  from: string;
  to: string;
}

export interface DefaultHoliday {
  date: string;
  nameLo: string;
  nameEn: string;
  kind: HolidayKind;
  womenOnly: boolean;
  nationality: null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Statutory defaults for one year (FR-WS-04.1/04.2): 1 Jan, 8 Mar (women only), 14–16 Apr, 1 May, 2 Dec.
 * Movable traditional festivals and substitute days are added by HR.
 */
export const defaultHolidaysForYear = (year: number): DefaultHoliday[] =>
  LAO_FIXED_HOLIDAYS.map((h) => ({
    date: `${year}-${pad(h.month)}-${pad(h.day)}`,
    nameLo: h.nameLo,
    nameEn: h.nameEn,
    kind: HolidayKind.PUBLIC,
    womenOnly: !!h.womenOnly,
    nationality: null,
  }));

/** Case- and whitespace-insensitive nationality key ("  Thai " and "thai" match). */
export const normalizeNationality = (value: string | null | undefined): string | null => {
  const v = value?.trim().replace(/\s+/g, ' ').toLowerCase();
  return v ? v : null;
};

/** Does this single holiday apply to the employee (ignoring the date)? */
export const holidayAppliesTo = (employee: HolidayEmployee, holiday: Pick<HolidayRule, 'womenOnly' | 'nationality'>): boolean => {
  if (holiday.womenOnly && employee.gender !== 'FEMALE') return false;
  const only = normalizeNationality(holiday.nationality);
  return only === null || only === normalizeNationality(employee.nationality);
};

/**
 * The holidays one employee is entitled to within `range` (inclusive), sorted by date:
 * - women-only days (8 March) apply to female employees only;
 * - nationality-specific days (FR-WS-05, e.g. a foreign worker's national day) apply only to
 *   employees whose nationality matches; days without a nationality apply to everyone.
 */
export const holidaysFor = <T extends HolidayRule>(employee: HolidayEmployee, holidays: readonly T[], range: DateRange): T[] =>
  holidays
    .filter((h) => h.date >= range.from && h.date <= range.to && holidayAppliesTo(employee, h))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/** Inclusive date range covering a calendar year. */
export const yearRange = (year: number): DateRange => ({ from: `${year}-01-01`, to: `${year}-12-31` });
