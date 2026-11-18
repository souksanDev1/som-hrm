/**
 * Leave rules (TOR FR-LV, technical analysis A14). Pure functions shared by the API, web and mobile; the API is
 * authoritative (it loads the employee's schedule, roster and holidays and calls these), clients only preview.
 *
 * - Leave year = calendar year (client 2026-11-18, Q10). Balances are the sum of ledger entries of one
 *   employee / type / year; a request spanning New Year is split by year.
 * - Dates are ISO calendar dates (YYYY-MM-DD) in the workspace time zone.
 */
import {
  HalfDay,
  LeaveCategory,
  LeaveCountingMethod,
  LeaveLedgerKind,
  LeaveQuotaPeriod,
  type Gender,
  type PayType,
} from '../enums';
import { LEAVE_LEGAL_MINIMUM } from './lao-labor';

/** Longest single request, in calendar days (bounds the day-by-day computation; maternity is 120). */
export const LEAVE_MAX_RANGE_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;
const toUtc = (isoDate: string) => Date.parse(`${isoDate}T00:00:00.000Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Days as stored (Decimal(6,2)): rounded to 2 decimals to avoid float drift in sums. */
export const roundLeaveDays = (n: number): number => Math.round(n * 100) / 100;

/** Leave year of a date (calendar year). */
export const leaveYearOf = (isoDate: string): number => Number(isoDate.slice(0, 4));

/** Every date from `from` to `to` inclusive (empty when `to < from`). */
export const datesInRange = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let t = toUtc(from), end = toUtc(to); t <= end; t += DAY_MS) out.push(fromUtc(t));
  return out;
};

/** Calendar days from `from` to `to` inclusive. */
export const calendarDaysInclusive = (from: string, to: string): number => Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1;

// ─────────────────────────── Range & counting ───────────────────────────

export type LeaveRangeError = 'leave_invalid_range' | 'leave_range_too_long' | 'leave_half_day_multi_day' | 'leave_half_day_not_allowed';

export interface LeaveRangeInput {
  startDate: string;
  endDate: string;
  halfDay: HalfDay;
  /** The leave type allows half days. */
  allowHalfDay: boolean;
}

/** Shape checks before counting: ordered range, bounded length, half day only on a single day of a type that allows it. */
export const validateLeaveRange = (input: LeaveRangeInput): LeaveRangeError | null => {
  if (input.endDate < input.startDate) return 'leave_invalid_range';
  if (calendarDaysInclusive(input.startDate, input.endDate) > LEAVE_MAX_RANGE_DAYS) return 'leave_range_too_long';
  if (input.halfDay !== HalfDay.NONE) {
    if (!input.allowHalfDay) return 'leave_half_day_not_allowed';
    if (input.startDate !== input.endDate) return 'leave_half_day_multi_day';
  }
  return null;
};

/** One date of the requested range as the employee's schedule sees it. */
export interface LeaveDayInfo {
  date: string;
  /** A scheduled working day of this employee (pattern or roster) that is not one of their holidays. */
  working: boolean;
}

export interface LeaveDayCount {
  /** Total leave days (0.5 for a half day). */
  days: number;
  /** Days per leave year (a request across New Year is split). */
  byYear: Record<number, number>;
  /** Dates that count (each 1 day, or 0.5 for a half day). */
  countedDates: string[];
}

/**
 * Days a request takes (FR-LV-03, FR-LV-04): working-day types count only the employee's own working days that are
 * not their holidays (standard or individual schedule, roster); calendar-day types (maternity) count every date.
 * A half day counts 0.5 whatever the scheduled hours of that day (client Q14), and 0 on a non-counted date.
 */
export const countLeaveDays = (days: readonly LeaveDayInfo[], method: LeaveCountingMethod, halfDay: HalfDay = HalfDay.NONE): LeaveDayCount => {
  const unit = halfDay === HalfDay.NONE ? 1 : 0.5;
  const countedDates = days.filter((d) => method === LeaveCountingMethod.CALENDAR_DAYS || d.working).map((d) => d.date);
  const byYear: Record<number, number> = {};
  for (const date of countedDates) byYear[leaveYearOf(date)] = roundLeaveDays((byYear[leaveYearOf(date)] ?? 0) + unit);
  return { days: roundLeaveDays(countedDates.length * unit), byYear, countedDates };
};

// ─────────────────────────── Policy & eligibility ───────────────────────────

export interface LeaveTypeRule {
  category: LeaveCategory;
  quotaPeriod: LeaveQuotaPeriod;
  countingMethod: LeaveCountingMethod;
  gender: Gender | null;
  allowHalfDay: boolean;
  requiresAttachment: boolean;
}

export interface LeavePolicyRule {
  daysPerYear: number;
  hazardousDays: number | null;
  multipleBirthDays: number | null;
  minServiceDays: number;
  /** Pay types `minServiceDays` applies to; empty = all. */
  minServicePayTypes: readonly PayType[];
}

export interface LeaveEmployee {
  gender: Gender | string;
  /** YYYY-MM-DD */
  hireDate: string;
  payType: PayType | string;
  hazardousWork: boolean;
}

/** Whether the policy's minimum service applies to this pay type (sick leave: daily/hourly only, Q15). */
export const minServiceApplies = (policy: Pick<LeavePolicyRule, 'minServicePayTypes'>, payType: string): boolean =>
  policy.minServicePayTypes.length === 0 || policy.minServicePayTypes.includes(payType as PayType);

/** First date the employee may use (and is granted) the type: hire date + minimum service when it applies. */
export const eligibleFrom = (employee: Pick<LeaveEmployee, 'hireDate' | 'payType'>, policy: Pick<LeavePolicyRule, 'minServiceDays' | 'minServicePayTypes'>): string =>
  minServiceApplies(policy, employee.payType) ? fromUtc(toUtc(employee.hireDate) + policy.minServiceDays * DAY_MS) : employee.hireDate;

/**
 * Days the quota allows: per year (YEARLY) or per request (PER_EVENT); `null` = no quota (UNLIMITED).
 * Hazardous-work employees get `hazardousDays` and a multiple birth `multipleBirthDays` when the policy sets them.
 */
export const quotaDays = (
  type: Pick<LeaveTypeRule, 'quotaPeriod'>,
  policy: Pick<LeavePolicyRule, 'daysPerYear' | 'hazardousDays' | 'multipleBirthDays'>,
  employee: Pick<LeaveEmployee, 'hazardousWork'>,
  options: { multipleBirth?: boolean } = {},
): number | null => {
  if (type.quotaPeriod === LeaveQuotaPeriod.UNLIMITED) return null;
  if (options.multipleBirth && policy.multipleBirthDays !== null) return policy.multipleBirthDays;
  if (employee.hazardousWork && policy.hazardousDays !== null) return policy.hazardousDays;
  return policy.daysPerYear;
};

/**
 * Date the yearly entitlement of `year` is granted (the accrual job posts it then): 1 January, or the day the
 * employee becomes eligible when that falls within the year — the full quota, no pro-rata (client Q10).
 * `null` = nothing for that year (not a YEARLY type, or not eligible before 31 December).
 */
export const entitlementGrantDate = (
  year: number,
  type: Pick<LeaveTypeRule, 'quotaPeriod'>,
  employee: Pick<LeaveEmployee, 'hireDate' | 'payType'>,
  policy: Pick<LeavePolicyRule, 'minServiceDays' | 'minServicePayTypes'>,
): string | null => {
  if (type.quotaPeriod !== LeaveQuotaPeriod.YEARLY) return null;
  const from = eligibleFrom(employee, policy);
  const jan1 = `${year}-01-01`;
  const grant = from > jan1 ? from : jan1;
  return grant <= `${year}-12-31` ? grant : null;
};

export type LeaveEligibilityError =
  | 'leave_gender_ineligible'
  | 'leave_min_service'
  | 'leave_no_working_days'
  | 'leave_insufficient_balance'
  | 'leave_exceeds_quota'
  | 'leave_multiple_birth_invalid';

export interface LeaveEligibilityInput {
  type: LeaveTypeRule;
  policy: LeavePolicyRule;
  employee: LeaveEmployee;
  startDate: string;
  count: Pick<LeaveDayCount, 'days' | 'byYear'>;
  /** YEARLY types: available balance per leave year, without this request. Missing year = 0. */
  balanceByYear?: Record<number, number>;
  multipleBirth?: boolean;
}

/**
 * Checks before a request is accepted (FR-LV-06): gender (maternity), tenure, something to take, and the remaining
 * balance (YEARLY) or the per-request quota (PER_EVENT). Returns every failed rule (empty = eligible).
 */
export const checkLeaveEligibility = (input: LeaveEligibilityInput): LeaveEligibilityError[] => {
  const { type, policy, employee, count } = input;
  const errors: LeaveEligibilityError[] = [];
  if (type.gender && type.gender !== employee.gender) errors.push('leave_gender_ineligible');
  if (input.multipleBirth && (type.category !== LeaveCategory.MATERNITY || policy.multipleBirthDays === null)) errors.push('leave_multiple_birth_invalid');
  if (input.startDate < eligibleFrom(employee, policy)) errors.push('leave_min_service');
  if (count.days <= 0) errors.push('leave_no_working_days');
  if (type.quotaPeriod === LeaveQuotaPeriod.YEARLY) {
    const short = Object.entries(count.byYear).some(([year, days]) => roundLeaveDays(days) > roundLeaveDays(input.balanceByYear?.[Number(year)] ?? 0));
    if (short) errors.push('leave_insufficient_balance');
  } else if (type.quotaPeriod === LeaveQuotaPeriod.PER_EVENT) {
    const quota = quotaDays(type, policy, employee, { multipleBirth: input.multipleBirth });
    if (quota !== null && count.days > quota) errors.push('leave_exceeds_quota');
  }
  return errors;
};

export interface LeavePolicyViolation {
  field: 'daysPerYear' | 'hazardousDays' | 'multipleBirthDays';
  legalMin: number;
}

/** Policy values below the legal minimum of the category (FR-LV-01.2); `null` = allowed. */
export const validateLeavePolicy = (
  category: LeaveCategory,
  policy: Pick<LeavePolicyRule, 'daysPerYear' | 'hazardousDays' | 'multipleBirthDays'>,
): LeavePolicyViolation | null => {
  const min = LEAVE_LEGAL_MINIMUM[category];
  if (!min) return null;
  if (policy.daysPerYear < min.days) return { field: 'daysPerYear', legalMin: min.days };
  if (min.hazardousDays !== undefined && (policy.hazardousDays ?? policy.daysPerYear) < min.hazardousDays) {
    return { field: 'hazardousDays', legalMin: min.hazardousDays };
  }
  if (min.multipleBirthDays !== undefined && (policy.multipleBirthDays ?? policy.daysPerYear) < min.multipleBirthDays) {
    return { field: 'multipleBirthDays', legalMin: min.multipleBirthDays };
  }
  return null;
};

// ─────────────────────────── Medical certificate ───────────────────────────

/** A certificate is needed when the type asks for one and the request is longer than the threshold (FR-LV-05.1/05.2). */
export const certificateRequired = (type: Pick<LeaveTypeRule, 'requiresAttachment'>, days: number, thresholdDays: number): boolean =>
  type.requiresAttachment && days > thresholdDays;

/**
 * The `n`-th working day after `date` (FR-LV-05.3: certificate within 3 working days after the leave, Q12).
 * `days` must cover the dates after `date` far enough; returns `null` when it does not reach `n` working days.
 * `n = 0` → `date` itself.
 */
export const nthWorkingDayAfter = (date: string, n: number, days: readonly LeaveDayInfo[]): string | null => {
  if (n <= 0) return date;
  let seen = 0;
  for (const d of [...days].filter((x) => x.date > date).sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (d.working && ++seen === n) return d.date;
  }
  return null;
};

// ─────────────────────────── Ledger ───────────────────────────

export interface LedgerEntryLike {
  kind: LeaveLedgerKind;
  /** Signed days. */
  days: number;
  periodYear: number;
}

export interface LeaveBalanceSummary {
  year: number;
  entitled: number;
  carried: number;
  /** Net days taken: usage minus cancelled usage (positive). */
  used: number;
  /** Net HR adjustments (signed). */
  adjusted: number;
  /** Carried days that expired (positive). */
  expired: number;
  /** Sum of every entry of the year. */
  balance: number;
}

/** Balance of one leave year = the sum of its ledger entries (FR-LV-07), broken down by movement kind. */
export const summarizeLedger = (entries: readonly LedgerEntryLike[], year: number): LeaveBalanceSummary => {
  const sum = (...kinds: LeaveLedgerKind[]) =>
    roundLeaveDays(entries.filter((e) => e.periodYear === year && kinds.includes(e.kind)).reduce((s, e) => s + e.days, 0));
  return {
    year,
    entitled: sum(LeaveLedgerKind.ENTITLEMENT),
    carried: sum(LeaveLedgerKind.CARRY),
    used: -sum(LeaveLedgerKind.USAGE, LeaveLedgerKind.CANCEL) || 0,
    adjusted: sum(LeaveLedgerKind.ADJUST),
    expired: -sum(LeaveLedgerKind.EXPIRE) || 0,
    balance: roundLeaveDays(entries.filter((e) => e.periodYear === year).reduce((s, e) => s + e.days, 0)),
  };
};

// ─────────────────────────── Carry-over (SHOULD) ───────────────────────────

/** Days carried into the next year: the unused balance, capped by `leave.carryOverMaxDays` (0 = off, FR-LV-08.1). */
export const carryOverDays = (yearEndBalance: number, maxDays: number): number => roundLeaveDays(Math.max(0, Math.min(yearEndBalance, maxDays)));

/** Last day of `month` (1–12) of `year`: carried days expire after it (`leave.carryOverExpiryMonth`, FR-LV-08.2). */
export const carryOverExpiryDate = (year: number, month: number): string => fromUtc(Date.UTC(year, month, 0));

/** Carried days still unused at expiry; usage of the year consumes carried days first. */
export const expiringCarryDays = (carried: number, usedUpToExpiry: number): number => roundLeaveDays(Math.max(0, carried - Math.max(0, usedUpToExpiry)));
