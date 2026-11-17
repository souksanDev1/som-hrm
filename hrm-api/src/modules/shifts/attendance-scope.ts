import { addDays, PERMISSIONS } from '@hrm/shared';
import type { Tx } from '../../db/client';
import { notFound } from '../../lib/errors';
import type { AuthContext } from '../auth/auth.service';
import { employeesRepository } from '../employees/employees.repository';

type Access = Pick<AuthContext, 'workspaceId' | 'employeeId' | 'permissions'>;

/**
 * Attendance data scope (FR-ATT-18, B8): employee ids whose attendance the caller may read, or `null` for the
 * whole workspace.
 * - `attendance.read_all` + `employee.read_all` (HR): the workspace;
 * - `attendance.read_all` alone (MANAGER): themselves and their whole reporting tree;
 * - everyone else: only themselves.
 */
export const attendanceScope = async (tx: Tx, auth: Access): Promise<string[] | null> => {
  if (!auth.permissions.includes(PERMISSIONS.ATTENDANCE_READ_ALL)) return auth.employeeId ? [auth.employeeId] : [];
  if (auth.permissions.includes(PERMISSIONS.EMPLOYEE_READ_ALL)) return null;
  if (!auth.employeeId) return [];
  return employeesRepository.reportingTreeIds(tx, auth.workspaceId, auth.employeeId);
};

/** 404 (never 403) for an employee outside the scope, so existence is not revealed. */
export const assertInScope = (scope: string[] | null, employeeId: string): void => {
  if (scope && !scope.includes(employeeId)) throw notFound();
};

/** Every ISO date from `from` to `to` inclusive. */
export const datesBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= 400; d = addDays(d, 1)) out.push(d);
  return out;
};

export const employeeName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.trim();
