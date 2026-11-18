import { PERMISSIONS, type LeaveBalance, type LeaveType } from '@hrm/shared';
import type { Db } from '../../db/client';
import { todayInTimeZone } from '../../lib/dates';
import { notFound } from '../../lib/errors';
import { workspaceTimeZone } from '../attendance/day-context';
import type { AuthContext } from '../auth/auth.service';
import { employeeAccess } from '../employees/employees.service';
import { leaveLedger } from './leave-ledger';
import { leaveTypesRepository, toLeaveTypeView } from './leave-types.repository';

/**
 * Leave reads shared by every leave screen (M6 base): the leave types for forms and the balances of an employee.
 * Policy editing, ledger adjustments, requests and the calendar live in their own services.
 */
export const createLeaveService = (db: Db) => ({
  /** Active types for everyone; HR (`leave.manage`) also sees inactive ones (FR-LV-01/02). */
  types: (auth: AuthContext): Promise<LeaveType[]> =>
    db.tenant(auth.workspaceId, async (tx) =>
      (await leaveTypesRepository.list(tx, auth.workspaceId, { activeOnly: !auth.permissions.includes(PERMISSIONS.LEAVE_MANAGE) })).map(toLeaveTypeView),
    ),

  /**
   * Balances of one employee for a leave year (default: the current year in the workspace time zone): oneself,
   * or anyone in the caller's data scope (reporting line, or the workspace with `employee.read_all`).
   */
  balances: (auth: AuthContext, query: { employeeId?: string; year?: number }): Promise<{ employeeId: string; year: number; balances: LeaveBalance[] }> =>
    db.tenant(auth.workspaceId, async (tx) => {
      const employeeId = query.employeeId ?? auth.employeeId;
      if (!employeeId) throw notFound('no_employee_profile');
      if (employeeId !== auth.employeeId) await employeeAccess.assertCanRead(tx, auth, employeeId);
      const year = query.year ?? Number(todayInTimeZone(await workspaceTimeZone(tx, auth.workspaceId)).slice(0, 4));
      return { employeeId, year, balances: await leaveLedger.summaries(tx, auth.workspaceId, employeeId, year) };
    }),
});

export type LeaveService = ReturnType<typeof createLeaveService>;
