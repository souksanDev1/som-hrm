import { datesInRange, HalfDay, interpolate, roundLeaveDays, translate, type ApprovalTeamLeave, type Locale } from '@hrm/shared';
import type { Tx } from '../../db/client';
import { toIsoDate } from '../../lib/dates';
import { auditRepository } from '../audit/audit.repository';
import { recomputeAttendanceDays } from '../attendance/attendance-days';

/**
 * Side effects shared by leave approval, withdrawal and cancellation (FR-LV-11/12). Run inside the caller's tenant
 * transaction.
 */

/** Recompute the stored attendance of every date of a leave, so approved leave shows LEAVE (not ABSENT). */
export const recomputeLeaveAttendance = async (tx: Tx, workspaceId: string, leave: { employeeId: string; startDate: Date; endDate: Date }) => {
  await recomputeAttendanceDays(tx, workspaceId, leave.employeeId, datesInRange(toIsoDate(leave.startDate)!, toIsoDate(leave.endDate)!));
};

/** Cancel the absence delegation created with a leave (FR-ORG-03.2), kept for history like a manual cancel. */
export const cancelLeaveDelegation = async (tx: Tx, workspaceId: string, leave: { id: string; delegationId: string | null }, actorUserId: string | null) => {
  if (!leave.delegationId) return;
  const row = await tx.approvalDelegation.findFirst({ where: { id: leave.delegationId, workspaceId, isActive: true } });
  if (!row) return;
  await tx.approvalDelegation.update({ where: { id: row.id }, data: { isActive: false } });
  await auditRepository.create(tx, {
    workspaceId,
    actorUserId,
    action: 'approval.delegation.cancel',
    entity: 'ApprovalDelegation',
    entityId: row.id,
    meta: { startDate: toIsoDate(row.startDate), endDate: toIsoDate(row.endDate), source: 'leave', leaveRequestId: leave.id },
  });
};

/** "start – end" or one date, plus the half-day part, in `locale`. */
export const leaveDatesLabel = (locale: Locale, r: { startDate: Date; endDate: Date; halfDay: HalfDay }) => {
  const start = toIsoDate(r.startDate)!;
  const end = toIsoDate(r.endDate)!;
  const dates = start === end ? start : interpolate(translate(locale, 'approval.summary.leave.dates'), { start, end });
  return r.halfDay === HalfDay.NONE ? dates : interpolate(translate(locale, 'approval.summary.leave.withHalfDay'), { dates, halfDay: translate(locale, `leave.halfDay.${r.halfDay}`) });
};

const TEAM_LIMIT = 50;

/**
 * Other employees with the same manager or in the same department as the requester whose APPROVED or PENDING leave
 * overlaps the given leave (FR-LV-13.10). The leave type is not returned.
 */
export const teamOnLeaveFor = async (tx: Tx, workspaceId: string, leaveRequestId: string): Promise<ApprovalTeamLeave[]> => {
  const leave = await tx.leaveRequest.findFirst({
    where: { workspaceId, id: leaveRequestId },
    select: { employeeId: true, startDate: true, endDate: true, employee: { select: { managerId: true, departmentId: true } } },
  });
  if (!leave) return [];
  const { managerId, departmentId } = leave.employee;
  const peers = [...(managerId ? [{ managerId }] : []), ...(departmentId ? [{ departmentId }] : [])];
  if (!peers.length) return [];
  const rows = await tx.leaveRequest.findMany({
    where: {
      workspaceId,
      id: { not: leaveRequestId },
      employeeId: { not: leave.employeeId },
      status: { in: ['APPROVED', 'PENDING'] },
      startDate: { lte: leave.endDate },
      endDate: { gte: leave.startDate },
      employee: { OR: peers },
    },
    select: {
      id: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      halfDay: true,
      days: true,
      status: true,
      employee: { select: { employeeCode: true, firstName: true, lastName: true } },
    },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    take: TEAM_LIMIT,
  });
  return rows.map((r) => ({
    requestId: r.id,
    employeeId: r.employeeId,
    employeeCode: r.employee.employeeCode,
    name: `${r.employee.firstName} ${r.employee.lastName}`,
    startDate: toIsoDate(r.startDate)!,
    endDate: toIsoDate(r.endDate)!,
    halfDay: r.halfDay,
    days: roundLeaveDays(Number(r.days)),
    status: r.status,
  }));
};
