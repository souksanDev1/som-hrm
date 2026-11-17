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

/** FR-EMP-03.5 — kind of employment contract. */
export const ContractType = { INDEFINITE: 'INDEFINITE', FIXED_TERM: 'FIXED_TERM', PROBATION: 'PROBATION' } as const;
export type ContractType = (typeof ContractType)[keyof typeof ContractType];
export const CONTRACT_TYPES = values(ContractType);

/** FR-EMP-03.6 — how pay is calculated. */
export const PayType = { MONTHLY: 'MONTHLY', DAILY: 'DAILY', HOURLY: 'HOURLY' } as const;
export type PayType = (typeof PayType)[keyof typeof PayType];
export const PAY_TYPES = values(PayType);

export const NationalityType = { LAO: 'LAO', FOREIGN: 'FOREIGN' } as const;
export type NationalityType = (typeof NationalityType)[keyof typeof NationalityType];
export const NATIONALITY_TYPES = values(NationalityType);

export const DocumentType = {
  WORK_PERMIT: 'WORK_PERMIT',
  VISA: 'VISA',
  PASSPORT: 'PASSPORT',
  RESIDENCE_PERMIT: 'RESIDENCE_PERMIT',
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
  DocumentType.RESIDENCE_PERMIT,
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

/** Result of one employee's work date (AttendanceDay, FR-ATT-18). */
export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  LATE: 'LATE',
  EARLY: 'EARLY',
  ABSENT: 'ABSENT',
  MISSING_IN: 'MISSING_IN',
  MISSING_OUT: 'MISSING_OUT',
  HOLIDAY: 'HOLIDAY',
  REST: 'REST',
  LEAVE: 'LEAVE',
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

/** How a punch reached the system (A13). */
export const AttendanceSource = {
  MOBILE: 'MOBILE',
  KIOSK: 'KIOSK',
  SCANNER: 'SCANNER',
  HR_ON_BEHALF: 'HR_ON_BEHALF',
  CORRECTION: 'CORRECTION',
} as const;
export type AttendanceSource = (typeof AttendanceSource)[keyof typeof AttendanceSource];

export const PunchKind = { IN: 'IN', OUT: 'OUT' } as const;
export type PunchKind = (typeof PunchKind)[keyof typeof PunchKind];

/** Review of a suspicious or off-site punch (FR-ATT-14, FR-ATT-16.3). */
export const PunchReviewStatus = { NONE: 'NONE', PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' } as const;
export type PunchReviewStatus = (typeof PunchReviewStatus)[keyof typeof PunchReviewStatus];

/** Attendance modes a branch can enable, several at once (FR-WS-06). */
export const AttendanceMode = { MOBILE: 'MOBILE', SCANNER: 'SCANNER', KIOSK: 'KIOSK' } as const;
export type AttendanceMode = (typeof AttendanceMode)[keyof typeof AttendanceMode];
export const ATTENDANCE_MODES = values(AttendanceMode);

export const OvertimeKind = { PRE: 'PRE', POST: 'POST' } as const;
export type OvertimeKind = (typeof OvertimeKind)[keyof typeof OvertimeKind];

export const ScanFormat = { ZKTECO: 'ZKTECO', HIP: 'HIP', GENERIC: 'GENERIC' } as const;
export type ScanFormat = (typeof ScanFormat)[keyof typeof ScanFormat];

export const ScanRowStatus = { OK: 'OK', UNMATCHED: 'UNMATCHED', DUPLICATE: 'DUPLICATE', INVALID: 'INVALID' } as const;
export type ScanRowStatus = (typeof ScanRowStatus)[keyof typeof ScanRowStatus];

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
export const REQUEST_STATUSES = values(RequestStatus);

/** What an approval request is about (FR-ORG-02). Each type is handled by its subject module. */
export const ApprovalSubjectType = {
  LEAVE: 'LEAVE',
  OVERTIME: 'OVERTIME',
  ATTENDANCE_CORRECTION: 'ATTENDANCE_CORRECTION',
  /** Out-of-zone check-in under an off-site permission (FR-ATT-16.3). */
  OFFSITE_CHECKIN: 'OFFSITE_CHECKIN',
  /** Move the device binding to a new phone (FR-ATT-11.3). */
  DEVICE_CHANGE: 'DEVICE_CHANGE',
} as const;
export type ApprovalSubjectType = (typeof ApprovalSubjectType)[keyof typeof ApprovalSubjectType];
export const APPROVAL_SUBJECT_TYPES = values(ApprovalSubjectType);

/** In what capacity an approver acts on a step (FR-ORG-06). */
export const ApprovalCapacity = {
  /** The expected manager for this level of the chain of command. */
  MANAGER: 'MANAGER',
  /** Someone the manager appointed for a date range (FR-ORG-03). */
  DELEGATE: 'DELEGATE',
  /** A higher manager: the expected one was absent or inactive, or the step escalated (FR-ORG-04/05). */
  UPPER_LEVEL: 'UPPER_LEVEL',
  /** HR fallback: nobody in the chain can approve (no manager, or everyone unavailable). */
  HR: 'HR',
} as const;
export type ApprovalCapacity = (typeof ApprovalCapacity)[keyof typeof ApprovalCapacity];
export const APPROVAL_CAPACITIES = values(ApprovalCapacity);

/** Outcome of one approval step. ESCALATED = left undecided too long and moved one level up (FR-ORG-05). */
export const ApprovalDecision = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ESCALATED: 'ESCALATED',
} as const;
export type ApprovalDecision = (typeof ApprovalDecision)[keyof typeof ApprovalDecision];
export const APPROVAL_DECISIONS = values(ApprovalDecision);

export const NotificationType = {
  DOCUMENT_EXPIRY: 'DOCUMENT_EXPIRY',
  LEAVE_REQUEST: 'LEAVE_REQUEST',
  LEAVE_DECISION: 'LEAVE_DECISION',
  CORRECTION_REQUEST: 'CORRECTION_REQUEST',
  CORRECTION_DECISION: 'CORRECTION_DECISION',
  SUSPICIOUS_ATTENDANCE: 'SUSPICIOUS_ATTENDANCE',
  SYSTEM: 'SYSTEM',
  APPROVAL_PENDING: 'APPROVAL_PENDING',
  APPROVAL_DECISION: 'APPROVAL_DECISION',
  APPROVAL_ESCALATED: 'APPROVAL_ESCALATED',
  MISSING_PUNCH: 'MISSING_PUNCH',
  PROBATION_ENDING: 'PROBATION_ENDING',
  OFFLINE_UNSYNCED: 'OFFLINE_UNSYNCED',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
export const NOTIFICATION_TYPES = values(NotificationType);

export const NotificationChannel = { PUSH: 'PUSH', SMS: 'SMS' } as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const DeliveryStatus = { PENDING: 'PENDING', SENT: 'SENT', FAILED: 'FAILED', SKIPPED: 'SKIPPED' } as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

export const WorkspaceStatus = { ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED' } as const;
export type WorkspaceStatus = (typeof WorkspaceStatus)[keyof typeof WorkspaceStatus];
export const WORKSPACE_STATUSES = values(WorkspaceStatus);

export const OtpPurpose = { FIRST_LOGIN: 'FIRST_LOGIN', PASSWORD_RESET: 'PASSWORD_RESET' } as const;
export type OtpPurpose = (typeof OtpPurpose)[keyof typeof OtpPurpose];
export const OTP_PURPOSES = values(OtpPurpose);

export const FilePurpose = {
  EMPLOYEE_DOCUMENT: 'EMPLOYEE_DOCUMENT',
  SELFIE: 'SELFIE',
  ATTACHMENT: 'ATTACHMENT',
  IMPORT: 'IMPORT',
} as const;
export type FilePurpose = (typeof FilePurpose)[keyof typeof FilePurpose];
export const FILE_PURPOSES = values(FilePurpose);

/** Holiday calendar entry kinds (FR-WS-04/05). */
export const HolidayKind = {
  PUBLIC: 'PUBLIC',
  TRADITIONAL: 'TRADITIONAL',
  SUBSTITUTE: 'SUBSTITUTE',
  NATIONAL_DAY: 'NATIONAL_DAY',
} as const;
export type HolidayKind = (typeof HolidayKind)[keyof typeof HolidayKind];
export const HOLIDAY_KINDS = values(HolidayKind);
