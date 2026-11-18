import { ApprovalSubjectType, isoDateInTimeZone, interpolate, roundLeaveDays, translate, type ApprovalSummary } from '@hrm/shared';
import { approvalLink, type ApprovalSubjectHandler } from '../approvals/approval-handlers';
import { parametersRepository } from '../parameters/parameters.repository';
import { leaveLedger } from './leave-ledger';
import { cancelLeaveDelegation, leaveDatesLabel, recomputeLeaveAttendance, teamOnLeaveFor } from './leave-effects';

/**
 * LEAVE_CANCEL subject (FR-LV-12.2): cancellation of an APPROVED leave, decided along the same chain as the leave.
 * Approval cancels the leave, gives its days back in the ledger (CANCEL), recomputes the attendance of its dates and
 * ends its absence delegation; rejection leaves the leave APPROVED. Subject = LeaveCancelRequest.
 */
export const leaveCancelApprovalHandler: ApprovalSubjectHandler = {
  subjectType: ApprovalSubjectType.LEAVE_CANCEL,

  async summarize(tx, workspaceId, subjectIds, locale) {
    const rows = await tx.leaveCancelRequest.findMany({
      where: { workspaceId, id: { in: subjectIds } },
      select: {
        id: true,
        reason: true,
        leaveRequest: { select: { startDate: true, endDate: true, halfDay: true, days: true, leaveType: { select: { nameLo: true, nameEn: true } } } },
      },
    });
    return new Map(
      rows.map((r): [string, ApprovalSummary] => {
        const leave = r.leaveRequest;
        return [
          r.id,
          {
            title: interpolate(translate(locale, 'approval.summary.leaveCancel.title'), {
              leaveType: locale === 'en' ? leave.leaveType.nameEn : leave.leaveType.nameLo,
              days: roundLeaveDays(Number(leave.days)),
            }),
            detail: interpolate(translate(locale, 'approval.summary.leaveCancel.detail'), { dates: leaveDatesLabel(locale, leave), reason: r.reason }),
          },
        ];
      }),
    );
  },

  async onApproved(tx, { workspaceId, subjectId, actorUserId }) {
    const now = new Date();
    const cancel = await tx.leaveCancelRequest.update({ where: { id: subjectId, workspaceId }, data: { status: 'APPROVED', decidedAt: now } });
    const leave = await tx.leaveRequest.update({
      where: { id: cancel.leaveRequestId, workspaceId },
      data: { status: 'CANCELLED', cancelledAt: now, cancelReason: cancel.reason },
    });
    const today = isoDateInTimeZone(await parametersRepository.workspaceTimezone(tx, workspaceId), now);
    await leaveLedger.postCancel(tx, workspaceId, leave.id, today, actorUserId, cancel.reason);
    await recomputeLeaveAttendance(tx, workspaceId, leave);
    await cancelLeaveDelegation(tx, workspaceId, leave, actorUserId);
  },

  async onRejected(tx, { workspaceId, subjectId }) {
    await tx.leaveCancelRequest.update({ where: { id: subjectId, workspaceId }, data: { status: 'REJECTED', decidedAt: new Date() } });
  },

  async teamOnLeave(tx, workspaceId, subjectId) {
    const cancel = await tx.leaveCancelRequest.findFirst({ where: { id: subjectId, workspaceId }, select: { leaveRequestId: true } });
    return cancel ? teamOnLeaveFor(tx, workspaceId, cancel.leaveRequestId) : [];
  },

  link: (request) => approvalLink(request.id),
};
