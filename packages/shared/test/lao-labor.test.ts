import { describe, expect, it } from 'vitest';
import {
  annualLeaveEntitlement,
  DEFAULT_LEAVE_TYPES,
  isFixedHoliday,
  isWorkingDay,
  maternityLeaveDays,
  WORK_WEEK,
} from '../src';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('Lao labour rules', () => {
  it('grants no annual leave before one full year of service', () => {
    expect(annualLeaveEntitlement(d('2025-01-01'), d('2025-12-31'))).toBe(0);
  });
  it('grants 15 days after one year, 18 for hazardous work', () => {
    expect(annualLeaveEntitlement(d('2024-01-01'), d('2025-01-01'))).toBe(15);
    expect(annualLeaveEntitlement(d('2024-01-01'), d('2025-01-01'), true)).toBe(18);
  });
  it('maternity leave is 105 days, 120 for multiple births', () => {
    expect(maternityLeaveDays(false)).toBe(105);
    expect(maternityLeaveDays(true)).toBe(120);
  });
  it('uses a 6-day working week with Sunday off', () => {
    expect(WORK_WEEK.workingDays).toHaveLength(6);
    expect(isWorkingDay(d('2026-11-14'))).toBe(true); // Saturday
    expect(isWorkingDay(d('2026-11-15'))).toBe(false); // Sunday
  });
  it('seeds sick leave at 30 days and annual at 15', () => {
    expect(DEFAULT_LEAVE_TYPES.find((t) => t.code === 'SICK')?.daysPerYear).toBe(30);
    expect(DEFAULT_LEAVE_TYPES.find((t) => t.code === 'ANNUAL')?.daysPerYear).toBe(15);
  });
  it("treats 8 March as a holiday for women only", () => {
    expect(isFixedHoliday(d('2026-03-08'), 'FEMALE')).toBe(true);
    expect(isFixedHoliday(d('2026-03-08'), 'MALE')).toBe(false);
    expect(isFixedHoliday(d('2026-12-02'), 'MALE')).toBe(true);
  });
});
