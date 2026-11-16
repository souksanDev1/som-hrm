import { SystemRole } from './enums';

/** Every permission key known by the system. Seeded into the Permission table. */
export const PERMISSIONS = {
  EMPLOYEE_READ: 'employee.read',
  EMPLOYEE_WRITE: 'employee.write',
  EMPLOYEE_SENSITIVE_READ: 'employee.sensitive.read',
  /** See every employee in the workspace; without it `employee.read` is limited to self + reporting line. */
  EMPLOYEE_READ_ALL: 'employee.read_all',
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
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

/** Default permissions per built-in role (HR can customise later). */
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
