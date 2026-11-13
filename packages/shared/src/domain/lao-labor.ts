/**
 * Lao labour-law defaults (Labour Law No. 43/NA, 2013).
 * These are seed defaults only — HR can adjust LeavePolicy per workspace.
 */
import { LeaveCategory } from '../enums';

export const WORK_WEEK = {
  /** 6-day working week: Monday (1) .. Saturday (6). Sunday (0) is the rest day. */
  workingDays: [1, 2, 3, 4, 5, 6] as const,
  maxHoursPerDay: 8,
  maxHoursPerWeek: 48,
} as const;

export const OVERTIME_LIMITS = {
  maxHoursPerDay: 3,
  maxHoursPerMonth: 45,
} as const;

export interface LeaveTypeDefault {
  code: string;
  category: LeaveCategory;
  nameLo: string;
  nameEn: string;
  /** Days granted per year (or per event for event-based leave). */
  daysPerYear: number;
  paid: boolean;
  requiresAttachment: boolean;
  /** Minimum service days before the employee may use this leave. */
  minServiceDays: number;
  allowHalfDay: boolean;
  /** Restrict to a gender (e.g. maternity). */
  gender?: 'FEMALE' | 'MALE';
}

export const DEFAULT_LEAVE_TYPES: readonly LeaveTypeDefault[] = [
  { code: 'ANNUAL', category: LeaveCategory.ANNUAL, nameLo: 'ລາພັກປະຈຳປີ', nameEn: 'Annual leave', daysPerYear: 15, paid: true, requiresAttachment: false, minServiceDays: 365, allowHalfDay: true },
  { code: 'SICK', category: LeaveCategory.SICK, nameLo: 'ລາປ່ວຍ', nameEn: 'Sick leave', daysPerYear: 30, paid: true, requiresAttachment: true, minServiceDays: 0, allowHalfDay: true },
  { code: 'MATERNITY', category: LeaveCategory.MATERNITY, nameLo: 'ລາເກີດລູກ', nameEn: 'Maternity leave', daysPerYear: 105, paid: true, requiresAttachment: true, minServiceDays: 0, allowHalfDay: false, gender: 'FEMALE' },
  { code: 'PERSONAL', category: LeaveCategory.PERSONAL, nameLo: 'ລາກິດທຸລະ', nameEn: 'Personal leave', daysPerYear: 3, paid: true, requiresAttachment: false, minServiceDays: 0, allowHalfDay: true },
  { code: 'MARRIAGE', category: LeaveCategory.MARRIAGE, nameLo: 'ລາແຕ່ງງານ', nameEn: 'Marriage leave', daysPerYear: 3, paid: true, requiresAttachment: false, minServiceDays: 0, allowHalfDay: false },
  { code: 'BEREAVEMENT', category: LeaveCategory.BEREAVEMENT, nameLo: 'ລາຍ້ອນຍາດເສຍຊີວິດ', nameEn: 'Bereavement leave', daysPerYear: 3, paid: true, requiresAttachment: false, minServiceDays: 0, allowHalfDay: false },
  { code: 'UNPAID', category: LeaveCategory.UNPAID, nameLo: 'ລາບໍ່ຮັບເງິນເດືອນ', nameEn: 'Unpaid leave', daysPerYear: 0, paid: false, requiresAttachment: false, minServiceDays: 0, allowHalfDay: true },
];

export const ANNUAL_LEAVE_DAYS = { normal: 15, hazardous: 18 } as const;
export const MATERNITY_LEAVE_DAYS = { single: 105, multiple: 120, minAfterBirth: 42 } as const;
/** Daily/hourly workers need > 90 days of service before sick leave is paid. */
export const SICK_LEAVE_MIN_SERVICE_DAYS_DAILY = 90;

/** Fixed-date Lao public holidays (month is 1-based). Movable holidays are added by HR. */
export const LAO_FIXED_HOLIDAYS: readonly { month: number; day: number; nameLo: string; nameEn: string; womenOnly?: boolean }[] = [
  { month: 1, day: 1, nameLo: 'ວັນປີໃໝ່ສາກົນ', nameEn: "International New Year's Day" },
  { month: 3, day: 8, nameLo: 'ວັນແມ່ຍິງສາກົນ', nameEn: "International Women's Day", womenOnly: true },
  { month: 4, day: 14, nameLo: 'ບຸນປີໃໝ່ລາວ', nameEn: 'Lao New Year' },
  { month: 4, day: 15, nameLo: 'ບຸນປີໃໝ່ລາວ', nameEn: 'Lao New Year' },
  { month: 4, day: 16, nameLo: 'ບຸນປີໃໝ່ລາວ', nameEn: 'Lao New Year' },
  { month: 5, day: 1, nameLo: 'ວັນກຳມະກອນສາກົນ', nameEn: 'International Labour Day' },
  { month: 12, day: 2, nameLo: 'ວັນຊາດ', nameEn: 'National Day' },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between two dates (UTC calendar days, end exclusive). */
export const daysBetween = (from: Date, to: Date): number =>
  Math.floor((Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) -
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) / MS_PER_DAY);

/** Annual leave entitlement: 0 before 1 full year of service, then 15 (18 for hazardous work). */
export const annualLeaveEntitlement = (hireDate: Date, asOf: Date, hazardous = false): number =>
  daysBetween(hireDate, asOf) >= 365 ? (hazardous ? ANNUAL_LEAVE_DAYS.hazardous : ANNUAL_LEAVE_DAYS.normal) : 0;

/** Maternity leave length for a birth event. */
export const maternityLeaveDays = (multipleBirth: boolean): number =>
  multipleBirth ? MATERNITY_LEAVE_DAYS.multiple : MATERNITY_LEAVE_DAYS.single;

/** Is the given date a working day under the 6-day week? */
export const isWorkingDay = (date: Date, workingDays: readonly number[] = WORK_WEEK.workingDays): boolean =>
  workingDays.includes(date.getUTCDay());

/** Is the date a fixed Lao public holiday? */
export const isFixedHoliday = (date: Date, gender?: string): boolean =>
  LAO_FIXED_HOLIDAYS.some(
    (h) => h.month === date.getUTCMonth() + 1 && h.day === date.getUTCDate() && (!h.womenOnly || gender === 'FEMALE'),
  );
