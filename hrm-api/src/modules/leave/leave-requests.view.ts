import type { LeaveRequest } from '@hrm/shared';
import { toIsoDate } from '../../lib/dates';
import type { Tx } from '../../db/client';
import { leaveRequestsRepository as repo, type LeaveRequestRow } from './leave-requests.repository';

export interface LeaveViewContext {
  /** Approval request id by subject id (the leave request and its cancellation requests). */
  approvals: ReadonlyMap<string, string>;
  /** Display name by user id (who filed). */
  userNames: ReadonlyMap<string, string>;
}

/**
 * API view of one leave request. A certificate is required when the request was stored with a due date
 * (FR-LV-05: set at filing from the type and `leave.certificateThresholdDays`).
 */
export const toLeaveRequestView = (r: LeaveRequestRow, ctx: LeaveViewContext): LeaveRequest => {
  const cancel = r.cancelRequests[0];
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeCode: r.employee.employeeCode,
    employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
    leaveType: { id: r.leaveType.id, code: r.leaveType.code, nameLo: r.leaveType.nameLo, nameEn: r.leaveType.nameEn },
    startDate: toIsoDate(r.startDate)!,
    endDate: toIsoDate(r.endDate)!,
    halfDay: r.halfDay,
    multipleBirth: r.multipleBirth,
    days: Number(r.days),
    reason: r.reason,
    status: r.status,
    filedAs: r.filedAs,
    submittedByName: r.submittedByUserId ? (ctx.userNames.get(r.submittedByUserId) ?? null) : null,
    certificateRequired: r.certificateDueDate !== null,
    certificateFileId: r.certificateFileId,
    certificateDueDate: toIsoDate(r.certificateDueDate),
    approvalRequestId: ctx.approvals.get(r.id) ?? null,
    cancelRequest: cancel ? { id: cancel.id, status: cancel.status, reason: cancel.reason, approvalRequestId: ctx.approvals.get(cancel.id) ?? null } : null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
    createdAt: r.createdAt.toISOString(),
  };
};

/** Views of loaded rows with their approval ids and filer names (one query each); used by every leave endpoint. */
export const buildLeaveRequestViews = async (tx: Tx, workspaceId: string, rows: LeaveRequestRow[]): Promise<LeaveRequest[]> => {
  const [approvals, userNames] = await Promise.all([
    repo.approvalIds(tx, workspaceId, rows.flatMap((r) => [r.id, ...r.cancelRequests.map((c) => c.id)])),
    repo.userNames(tx, workspaceId, rows.flatMap((r) => (r.submittedByUserId ? [r.submittedByUserId] : []))),
  ]);
  return rows.map((r) => toLeaveRequestView(r, { approvals, userNames }));
};
