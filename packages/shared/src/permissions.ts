import { SystemRole } from './enums';

/** Every permission key known by the system. Seeded into the Permission table. */
export const PERMISSIONS = {
  EMPLOYEE_READ: 'employee.read',
  EMPLOYEE_WRITE: 'employee.write',
  EMPLOYEE_SENSITIVE_READ: 'employee.sensitive.read',
  /** See every employee in the workspace; without it `employee.read` is limited to self + reporting line. */
  EMPLOYEE_READ_ALL: 'employee.read_all',
  /** Bulk-create employees from an Excel/CSV file (FR-EMP-09); separate from `employee.write` so it can be granted on its own. */
  EMPLOYEE_IMPORT: 'employee.import',
  ORG_READ: 'org.read',
  ORG_WRITE: 'org.write',
  USER_MANAGE: 'user.manage',
  AUDIT_READ: 'audit.read',
  ATTENDANCE_READ_ALL: 'attendance.read_all',
  ATTENDANCE_MANAGE: 'attendance.manage',
  LEAVE_APPROVE: 'leave.approve',
  LEAVE_MANAGE: 'leave.manage',
  SETTINGS_MANAGE: 'settings.manage',
  /** Workspace standard working schedule and per-employee overrides (FR-WS-03). */
  SCHEDULE_MANAGE: 'schedule.manage',
  /** See and cancel every manager's approval delegations and appoint delegates on their behalf (FR-ORG-03.1). */
  APPROVAL_DELEGATE_MANAGE: 'approval.delegate.manage',
  /** Decide requests nobody in the chain of command can (no manager, or all unavailable); notified on escalation (FR-ORG-02, FR-ORG-05.2). */
  APPROVAL_HR_FALLBACK: 'approval.hr_fallback',
  /** Suspicious-attendance queue: approve or reject flagged punches (FR-ATT-14). */
  ATTENDANCE_REVIEW: 'attendance.review',
  /** Record a punch for an employee, reason mandatory and audit-logged (FR-ATT-04). */
  ATTENDANCE_PUNCH_ON_BEHALF: 'attendance.punch_on_behalf',
  /** See and reset employees' bound devices; decide device-change requests as HR (FR-ATT-11). */
  ATTENDANCE_DEVICE_MANAGE: 'attendance.device.manage',
  /** Grant and revoke off-site work permissions (FR-ATT-16.1). */
  ATTENDANCE_OFFSITE_MANAGE: 'attendance.offsite.manage',
  /** Import scanner attendance files (FR-ATT-02). */
  SCAN_IMPORT: 'scan.import',
  /** Enrol and revoke kiosk tablets (FR-ATT-03). */
  KIOSK_MANAGE: 'kiosk.manage',
  /** Define shifts and the rotating roster (FR-ATT-17). */
  SHIFT_MANAGE: 'shift.manage',
  /** File leave on behalf of any employee, e.g. staff without a smartphone (FR-LV-10.1). Managers file for their own reporting line without it. */
  LEAVE_FILE_ON_BEHALF: 'leave.file_on_behalf',
  /** Adjust leave balances with a mandatory reason (FR-LV-07.2). */
  LEAVE_LEDGER_ADJUST: 'leave.ledger.adjust',
  /** See the leave calendar of every department with types and pending requests (FR-LV-13.9). */
  LEAVE_CALENDAR_READ_ALL: 'leave.calendar.read_all',
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

/**
 * Default permissions per built-in role (HR can customise later).
 * Deciding approvals needs no permission: it follows the chain of command (FR-ORG-02), and anyone
 * with direct reports may appoint their own delegates (FR-ORG-03.1).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = {
  [SystemRole.OWNER]: ALL_PERMISSIONS,
  [SystemRole.HR_ADMIN]: ALL_PERMISSIONS.filter((p) => p !== PERMISSIONS.SETTINGS_MANAGE),
  [SystemRole.MANAGER]: [
    PERMISSIONS.EMPLOYEE_READ,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.ATTENDANCE_READ_ALL,
    PERMISSIONS.LEAVE_APPROVE,
  ],
  [SystemRole.EMPLOYEE]: [PERMISSIONS.ORG_READ],
};

export const hasPermission = (granted: readonly string[], required: Permission): boolean =>
  granted.includes(required);
