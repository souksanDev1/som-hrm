/**
 * Domain enums shared by API, web and mobile.
 * Values MUST stay in sync with the Prisma enums in hrm-api/prisma/schema.prisma.
 */

const values = <T extends string>(obj: Record<T, T>) => Object.values(obj) as [T, ...T[]];

export const Gender = { MALE: 'MALE', FEMALE: 'FEMALE', OTHER: 'OTHER' } as const;
export type Gender = (typeof Gender)[keyof typeof Gender];
export const GENDERS = values(Gender);

export const EmploymentStatus = {
  PROBATION: 'PROBATION',
  ACTIVE: 'ACTIVE',
  ON_LEAVE: 'ON_LEAVE',
  RESIGNED: 'RESIGNED',
  TERMINATED: 'TERMINATED',
} as const;
export type EmploymentStatus = (typeof EmploymentStatus)[keyof typeof EmploymentStatus];
export const EMPLOYMENT_STATUSES = values(EmploymentStatus);

export const EmploymentType = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  DAILY: 'DAILY',
  HOURLY: 'HOURLY',
  CONTRACT: 'CONTRACT',
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];
export const EMPLOYMENT_TYPES = values(EmploymentType);

export const NationalityType = { LAO: 'LAO', FOREIGN: 'FOREIGN' } as const;
export type NationalityType = (typeof NationalityType)[keyof typeof NationalityType];
export const NATIONALITY_TYPES = values(NationalityType);

export const DocumentType = {
  WORK_PERMIT: 'WORK_PERMIT',
  VISA: 'VISA',
  PASSPORT: 'PASSPORT',
  ID_CARD: 'ID_CARD',
  FAMILY_BOOK: 'FAMILY_BOOK',
  CONTRACT: 'CONTRACT',
  MEDICAL_CERT: 'MEDICAL_CERT',
  OTHER: 'OTHER',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];
export const DOCUMENT_TYPES = values(DocumentType);

/** Documents that foreign workers must keep valid; these trigger expiry alerts. */
export const FOREIGN_WORKER_DOCUMENTS: readonly DocumentType[] = [
  DocumentType.WORK_PERMIT,
  DocumentType.VISA,
  DocumentType.PASSPORT,
];

export const LoginMethod = { PASSWORD: 'PASSWORD', PIN: 'PIN' } as const;
export type LoginMethod = (typeof LoginMethod)[keyof typeof LoginMethod];

export const SystemRole = {
  OWNER: 'OWNER',
  HR_ADMIN: 'HR_ADMIN',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
} as const;
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];

export const AttendanceStatus = {
  ON_TIME: 'ON_TIME',
  LATE: 'LATE',
  EARLY_LEAVE: 'EARLY_LEAVE',
  ABSENT: 'ABSENT',
  ON_LEAVE: 'ON_LEAVE',
  HOLIDAY: 'HOLIDAY',
  DAY_OFF: 'DAY_OFF',
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const AttendanceSource = { MOBILE: 'MOBILE', KIOSK: 'KIOSK', SCANNER: 'SCANNER', MANUAL: 'MANUAL' } as const;
export type AttendanceSource = (typeof AttendanceSource)[keyof typeof AttendanceSource];

export const LeaveCategory = {
  ANNUAL: 'ANNUAL',
  SICK: 'SICK',
  MATERNITY: 'MATERNITY',
  PATERNITY: 'PATERNITY',
  PERSONAL: 'PERSONAL',
  MARRIAGE: 'MARRIAGE',
  BEREAVEMENT: 'BEREAVEMENT',
  UNPAID: 'UNPAID',
} as const;
export type LeaveCategory = (typeof LeaveCategory)[keyof typeof LeaveCategory];
export const LEAVE_CATEGORIES = values(LeaveCategory);

export const RequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export const NotificationType = {
  DOCUMENT_EXPIRY: 'DOCUMENT_EXPIRY',
  LEAVE_REQUEST: 'LEAVE_REQUEST',
  LEAVE_DECISION: 'LEAVE_DECISION',
  CORRECTION_REQUEST: 'CORRECTION_REQUEST',
  CORRECTION_DECISION: 'CORRECTION_DECISION',
  SUSPICIOUS_ATTENDANCE: 'SUSPICIOUS_ATTENDANCE',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
