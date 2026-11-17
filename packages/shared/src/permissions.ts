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
