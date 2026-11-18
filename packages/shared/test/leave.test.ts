import { describe, expect, it } from 'vitest';
import {
  carryOverDays,
  carryOverExpiryDate,
  certificateRequired,
  checkLeaveEligibility,
  countLeaveDays,
  datesInRange,
  eligibleFrom,
  entitlementGrantDate,
  expiringCarryDays,
  nthWorkingDayAfter,
  quotaDays,
  summarizeLedger,
  validateLeavePolicy,
  validateLeaveRange,
  type LeaveDayInfo,
  type LeaveEligibilityInput,
  type LeavePolicyRule,
  type LeaveTypeRule,
} from '../src';

/** Mon–Sat working week (Sunday off) with `holidays` off. */
const week = (from: string, to: string, holidays: string[] = []): LeaveDayInfo[] =>
  datesInRange(from, to).map((date) => ({ date, working: new Date(`${date}T00:00:00Z`).getUTCDay() !== 0 && !holidays.includes(date) }));

const annual: LeaveTypeRule = { category: 'ANNUAL', quotaPeriod: 'YEARLY', countingMethod: 'WORKING_DAYS', gender: null, allowHalfDay: true, requiresAttachment: false };
const annualPolicy: LeavePolicyRule = { daysPerYear: 15, hazardousDays: 18, multipleBirthDays: null, minServiceDays: 365, minServicePayTypes: [] };
const sick: LeaveTypeRule = { ...annual, category: 'SICK', requiresAttachment: true };
const sickPolicy: LeavePolicyRule = { daysPerYear: 30, hazardousDays: null, multipleBirthDays: null, minServiceDays: 90, minServicePayTypes: ['DAILY', 'HOURLY'] };
const maternity: LeaveTypeRule = { category: 'MATERNITY', quotaPeriod: 'PER_EVENT', countingMethod: 'CALENDAR_DAYS', gender: 'FEMALE', allowHalfDay: false, requiresAttachment: true };
const maternityPolicy: LeavePolicyRule = { daysPerYear: 105, hazardousDays: null, multipleBirthDays: 120, minServiceDays: 0, minServicePayTypes: [] };
const personal: LeaveTypeRule = { ...annual, category: 'PERSONAL', quotaPeriod: 'PER_EVENT' };
const personalPolicy: LeavePolicyRule = { ...annualPolicy, daysPerYear: 3, hazardousDays: null, minServiceDays: 0 };
const emp = { gender: 'FEMALE', hireDate: '2024-03-01', payType: 'MONTHLY', hazardousWork: false };

describe('validateLeaveRange', () => {
  const base = { startDate: '2026-11-16', endDate: '2026-11-16', halfDay: 'NONE' as const, allowHalfDay: true };
  it('accepts a single full or half day', () => {
    expect(validateLeaveRange(base)).toBeNull();
    expect(validateLeaveRange({ ...base, halfDay: 'AM' })).toBeNull();
  });
  it('rejects reversed, too long, multi-day half and disallowed half days', () => {
    expect(validateLeaveRange({ ...base, endDate: '2026-11-15' })).toBe('leave_invalid_range');
    expect(validateLeaveRange({ ...base, endDate: '2027-11-17' })).toBe('leave_range_too_long');
    expect(validateLeaveRange({ ...base, endDate: '2026-11-17', halfDay: 'PM' })).toBe('leave_half_day_multi_day');
    expect(validateLeaveRange({ ...base, halfDay: 'AM', allowHalfDay: false })).toBe('leave_half_day_not_allowed');
  });
});

describe('countLeaveDays', () => {
  it('skips the weekly rest day and holidays for working-day types (FR-LV-03.3, 04.2)', () => {
    // Mon 13 Apr – Sat 18 Apr 2026, Lao New Year 14–16 Apr → Mon, Fri, Sat
    const c = countLeaveDays(week('2026-04-13', '2026-04-19', ['2026-04-14', '2026-04-15', '2026-04-16']), 'WORKING_DAYS');
    expect(c.days).toBe(3);
    expect(c.countedDates).toEqual(['2026-04-13', '2026-04-17', '2026-04-18']);
  });
  it('follows an individual schedule (e.g. Mon–Fri) passed in as working flags', () => {
    const monFri = datesInRange('2026-11-16', '2026-11-22').map((date) => ({ date, working: ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) }));
    expect(countLeaveDays(monFri, 'WORKING_DAYS').days).toBe(5);
  });
  it('counts maternity in calendar days: 105 days including Sundays and holidays (FR-LV-04.1)', () => {
    const days = week('2026-03-01', '2026-06-13', ['2026-04-14']);
    expect(days).toHaveLength(105);
    expect(countLeaveDays(days, 'CALENDAR_DAYS').days).toBe(105);
  });
  it('counts a half day as 0.5 whatever the scheduled hours, 0 on a rest day (Q14)', () => {
    expect(countLeaveDays(week('2026-11-21', '2026-11-21'), 'WORKING_DAYS', 'AM').days).toBe(0.5); // Saturday
    expect(countLeaveDays(week('2026-11-22', '2026-11-22'), 'WORKING_DAYS', 'PM').days).toBe(0); // Sunday
  });
  it('splits a request across New Year by leave year', () => {
    const c = countLeaveDays(week('2026-12-30', '2027-01-04', ['2027-01-01']), 'WORKING_DAYS');
    expect(c.byYear).toEqual({ 2026: 2, 2027: 2 });
  });
});

describe('eligibility', () => {
  const input = (over: Partial<LeaveEligibilityInput> = {}): LeaveEligibilityInput => ({
    type: annual,
    policy: annualPolicy,
    employee: emp,
    startDate: '2026-11-16',
    count: { days: 2, byYear: { 2026: 2 } },
    balanceByYear: { 2026: 15 },
    ...over,
  });
  it('passes with tenure and balance', () => {
    expect(checkLeaveEligibility(input())).toEqual([]);
  });
  it('blocks annual leave before one year of service (FR-LV-06.1)', () => {
    expect(checkLeaveEligibility(input({ employee: { ...emp, hireDate: '2026-01-10' } }))).toContain('leave_min_service');
    expect(eligibleFrom({ hireDate: '2025-11-16', payType: 'MONTHLY' }, annualPolicy)).toBe('2026-11-16');
    expect(checkLeaveEligibility(input({ employee: { ...emp, hireDate: '2025-11-16' } }))).toEqual([]);
  });
  it('blocks when the balance is short in any year (FR-LV-06.2)', () => {
    expect(checkLeaveEligibility(input({ balanceByYear: { 2026: 1.5 } }))).toEqual(['leave_insufficient_balance']);
    expect(checkLeaveEligibility(input({ count: { days: 2, byYear: { 2026: 1, 2027: 1 } }, balanceByYear: { 2026: 15 } }))).toEqual(['leave_insufficient_balance']);
  });
  it('blocks maternity for men (FR-LV-06.3) and checks the per-request quota', () => {
    const m = input({ type: maternity, policy: maternityPolicy, count: { days: 105, byYear: { 2026: 105 } } });
    expect(checkLeaveEligibility(m)).toEqual([]);
    expect(checkLeaveEligibility({ ...m, employee: { ...emp, gender: 'MALE' } })).toEqual(['leave_gender_ineligible']);
    expect(checkLeaveEligibility({ ...m, count: { days: 110, byYear: { 2026: 110 } } })).toEqual(['leave_exceeds_quota']);
    expect(checkLeaveEligibility({ ...m, count: { days: 110, byYear: { 2026: 110 } }, multipleBirth: true })).toEqual([]);
  });
  it('limits the 3-day event leave per request, not per year (Q11)', () => {
    const p = input({ type: personal, policy: personalPolicy, balanceByYear: undefined, count: { days: 3, byYear: { 2026: 3 } } });
    expect(checkLeaveEligibility(p)).toEqual([]);
    expect(checkLeaveEligibility({ ...p, count: { days: 4, byYear: { 2026: 4 } } })).toEqual(['leave_exceeds_quota']);
  });
  it('applies the sick-leave 90-day rule to daily/hourly workers only (Q15)', () => {
    const s = input({ type: sick, policy: sickPolicy, employee: { ...emp, hireDate: '2026-10-01' }, balanceByYear: { 2026: 30 } });
    expect(checkLeaveEligibility(s)).toEqual([]);
    expect(checkLeaveEligibility({ ...s, employee: { ...s.employee, payType: 'DAILY' } })).toEqual(['leave_min_service']);
  });
  it('flags an empty selection and a multiple birth on a non-maternity type', () => {
    expect(checkLeaveEligibility(input({ count: { days: 0, byYear: {} } }))).toEqual(['leave_no_working_days']);
    expect(checkLeaveEligibility(input({ multipleBirth: true }))).toEqual(['leave_multiple_birth_invalid']);
  });
});

describe('quota and yearly grant', () => {
  it('uses hazardous / multiple-birth quotas and none for unlimited', () => {
    expect(quotaDays(annual, annualPolicy, { hazardousWork: false })).toBe(15);
    expect(quotaDays(annual, annualPolicy, { hazardousWork: true })).toBe(18);
    expect(quotaDays(maternity, maternityPolicy, { hazardousWork: false }, { multipleBirth: true })).toBe(120);
    expect(quotaDays({ quotaPeriod: 'UNLIMITED' }, annualPolicy, { hazardousWork: false })).toBeNull();
  });
  it('grants annual leave on the first anniversary, then every 1 January, full quota (Q10)', () => {
    const e = { hireDate: '2025-07-15', payType: 'MONTHLY' };
    expect(entitlementGrantDate(2025, annual, e, annualPolicy)).toBeNull();
    expect(entitlementGrantDate(2026, annual, e, annualPolicy)).toBe('2026-07-15');
    expect(entitlementGrantDate(2027, annual, e, annualPolicy)).toBe('2027-01-01');
  });
  it('grants nothing for per-request types', () => {
    expect(entitlementGrantDate(2026, personal, { hireDate: '2020-01-01', payType: 'MONTHLY' }, personalPolicy)).toBeNull();
  });
});

describe('validateLeavePolicy (FR-LV-01.2)', () => {
  it('blocks values below the legal minimum', () => {
    expect(validateLeavePolicy('ANNUAL', { daysPerYear: 14, hazardousDays: 18, multipleBirthDays: null })).toEqual({ field: 'daysPerYear', legalMin: 15 });
    expect(validateLeavePolicy('ANNUAL', { daysPerYear: 16, hazardousDays: 17, multipleBirthDays: null })).toEqual({ field: 'hazardousDays', legalMin: 18 });
    expect(validateLeavePolicy('MATERNITY', { daysPerYear: 105, hazardousDays: null, multipleBirthDays: 110 })).toEqual({ field: 'multipleBirthDays', legalMin: 120 });
  });
  it('allows more generous values and any value for custom types', () => {
    expect(validateLeavePolicy('ANNUAL', { daysPerYear: 20, hazardousDays: 22, multipleBirthDays: null })).toBeNull();
    expect(validateLeavePolicy('OTHER', { daysPerYear: 0, hazardousDays: null, multipleBirthDays: null })).toBeNull();
  });
});

describe('certificate', () => {
  it('is required above the threshold for types that ask for it (FR-LV-05.1/05.2)', () => {
    expect(certificateRequired(sick, 1, 1)).toBe(false);
    expect(certificateRequired(sick, 1.5, 1)).toBe(true);
    expect(certificateRequired(annual, 5, 1)).toBe(false);
  });
  it('is due 3 working days after the leave ends (Q12)', () => {
    // Leave ends Thu 19 Nov 2026 → Fri 20, Sat 21, (Sun off), Mon 23
    expect(nthWorkingDayAfter('2026-11-19', 3, week('2026-11-20', '2026-11-30'))).toBe('2026-11-23');
    expect(nthWorkingDayAfter('2026-11-19', 3, week('2026-11-20', '2026-11-21'))).toBeNull();
    expect(nthWorkingDayAfter('2026-11-19', 0, [])).toBe('2026-11-19');
  });
});

describe('ledger and carry-over', () => {
  const entries = [
    { kind: 'ENTITLEMENT' as const, days: 15, periodYear: 2026 },
    { kind: 'CARRY' as const, days: 2, periodYear: 2026 },
    { kind: 'USAGE' as const, days: -3, periodYear: 2026 },
    { kind: 'CANCEL' as const, days: 1, periodYear: 2026 },
    { kind: 'ADJUST' as const, days: -0.5, periodYear: 2026 },
    { kind: 'EXPIRE' as const, days: -1, periodYear: 2026 },
    { kind: 'ENTITLEMENT' as const, days: 15, periodYear: 2025 },
  ];
  it('sums grant → use → cancel → adjust per year (FR-LV-07)', () => {
    expect(summarizeLedger(entries, 2026)).toEqual({ year: 2026, entitled: 15, carried: 2, used: 2, adjusted: -0.5, expired: 1, balance: 13.5 });
    expect(summarizeLedger([], 2026).balance).toBe(0);
  });
  it('caps carry-over and computes expiry (FR-LV-08)', () => {
    expect(carryOverDays(7, 0)).toBe(0);
    expect(carryOverDays(7, 5)).toBe(5);
    expect(carryOverDays(-1, 5)).toBe(0);
    expect(carryOverExpiryDate(2027, 3)).toBe('2027-03-31');
    expect(carryOverExpiryDate(2028, 2)).toBe('2028-02-29');
    expect(expiringCarryDays(5, 2)).toBe(3);
    expect(expiringCarryDays(5, 8)).toBe(0);
  });
});
