/**
 * Lao labour-law defaults (Labour Law No. 43/NA, 2013).
 * Seed defaults only: each workspace gets its own leave types / policies (HR edits them, FR-LV-01) and business
 * numbers live in the parameter registry. The one hard rule kept here is the legal minimum per statutory leave
 * category (FR-LV-01.2), which HR cannot go below.
 */
import { LeaveCategory, LeaveCountingMethod, LeaveQuotaPeriod, PayType } from '../enums';

export const WORK_WEEK = {
  /** 6-day working week: Monday (1) .. Saturday (6). Sunday (0) is the rest day. */
  workingDays: [1, 2, 3, 4, 5, 6] as const,
  maxHoursPerDay: 8,
  maxHoursPerWeek: 48,
} as const;

export interface LeaveTypeDefault {
  code: string;
  category: LeaveCategory;
  nameLo: string;
  nameEn: string;
  /** Days per leave year (YEARLY) or per request (PER_EVENT). */
  daysPerYear: number;
  /** Annual leave for hazardous work. */
  hazardousDays?: number;
  /** Maternity leave for a multiple birth. */
  multipleBirthDays?: number;
  countingMethod: LeaveCountingMethod;
  quotaPeriod: LeaveQuotaPeriod;
  paid: boolean;
  requiresAttachment: boolean;
  /** Minimum service days before the employee may use (and is granted) this leave. */
  minServiceDays: number;
  /** Pay types the minimum service applies to; empty = all. */
  minServicePayTypes: readonly PayType[];
  allowHalfDay: boolean;
  /** Restrict to a gender (e.g. maternity). */
  gender?: 'FEMALE' | 'MALE';
}

const W = LeaveCountingMethod.WORKING_DAYS;
const { YEARLY, PER_EVENT, UNLIMITED } = LeaveQuotaPeriod;

/**
 * Statutory leave types seeded into every workspace, in display order. Annual leave is granted after one year of
 * service, per calendar year, without pro-rata (client 2026-11-18, Q10); the 3-day event leaves are per request
 * (Q11); sick leave needs > 90 days of service for daily/hourly workers only (Q15).
 */
export const DEFAULT_LEAVE_TYPES: readonly LeaveTypeDefault[] = [
  { code: 'ANNUAL', category: LeaveCategory.ANNUAL, nameLo: 'ລາພັກປະຈຳປີ', nameEn: 'Annual leave', daysPerYear: 15, hazardousDays: 18, countingMethod: W, quotaPeriod: YEARLY, paid: true, requiresAttachment: false, minServiceDays: 365, minServicePayTypes: [], allowHalfDay: true },
  { code: 'SICK', category: LeaveCategory.SICK, nameLo: 'ລາປ່ວຍ', nameEn: 'Sick leave', daysPerYear: 30, countingMethod: W, quotaPeriod: YEARLY, paid: true, requiresAttachment: true, minServiceDays: 90, minServicePayTypes: [PayType.DAILY, PayType.HOURLY], allowHalfDay: true },
  { code: 'MATERNITY', category: LeaveCategory.MATERNITY, nameLo: 'ລາເກີດລູກ', nameEn: 'Maternity leave', daysPerYear: 105, multipleBirthDays: 120, countingMethod: LeaveCountingMethod.CALENDAR_DAYS, quotaPeriod: PER_EVENT, paid: true, requiresAttachment: true, minServiceDays: 0, minServicePayTypes: [], allowHalfDay: false, gender: 'FEMALE' },
  { code: 'PERSONAL', category: LeaveCategory.PERSONAL, nameLo: 'ລາກິດທຸລະ', nameEn: 'Personal leave', daysPerYear: 3, countingMethod: W, quotaPeriod: PER_EVENT, paid: true, requiresAttachment: false, minServiceDays: 0, minServicePayTypes: [], allowHalfDay: true },
  { code: 'MARRIAGE', category: LeaveCategory.MARRIAGE, nameLo: 'ລາແຕ່ງງານ', nameEn: 'Marriage leave', daysPerYear: 3, countingMethod: W, quotaPeriod: PER_EVENT, paid: true, requiresAttachment: false, minServiceDays: 0, minServicePayTypes: [], allowHalfDay: false },
  { code: 'BEREAVEMENT', category: LeaveCategory.BEREAVEMENT, nameLo: 'ລາຍ້ອນຍາດເສຍຊີວິດ', nameEn: 'Bereavement leave', daysPerYear: 3, countingMethod: W, quotaPeriod: PER_EVENT, paid: true, requiresAttachment: false, minServiceDays: 0, minServicePayTypes: [], allowHalfDay: false },
  { code: 'UNPAID', category: LeaveCategory.UNPAID, nameLo: 'ລາບໍ່ຮັບເງິນເດືອນ', nameEn: 'Unpaid leave', daysPerYear: 0, countingMethod: W, quotaPeriod: UNLIMITED, paid: false, requiresAttachment: false, minServiceDays: 0, minServicePayTypes: [], allowHalfDay: true },
];

/** Least days the law allows a leave policy to grant (FR-LV-01.2). */
export interface LeaveLegalMinimum {
  days: number;
  hazardousDays?: number;
  multipleBirthDays?: number;
}

/**
 * Legal minimum per statutory category (Lao Labour Law 2013): annual 15 (18 hazardous), sick 30, maternity 105
 * (120 multiple birth), 3 days for personal/marriage/bereavement. Unpaid, paternity and custom types have none.
 */
export const LEAVE_LEGAL_MINIMUM: Partial<Record<LeaveCategory, LeaveLegalMinimum>> = {
  [LeaveCategory.ANNUAL]: { days: 15, hazardousDays: 18 },
  [LeaveCategory.SICK]: { days: 30 },
  [LeaveCategory.MATERNITY]: { days: 105, multipleBirthDays: 120 },
  [LeaveCategory.PERSONAL]: { days: 3 },
  [LeaveCategory.MARRIAGE]: { days: 3 },
  [LeaveCategory.BEREAVEMENT]: { days: 3 },
};

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
