import { ApprovalSubjectType, interpolate, roundLeaveDays, translate, type ApprovalSummary } from '@hrm/shared';
import { approvalLink, type ApprovalSubjectHandler } from '../approvals/approval-handlers';
import { leaveLedger } from './leave-ledger';
import { cancelLeaveDelegation, leaveDatesLabel, recomputeLeaveAttendance, teamOnLeaveFor } from './leave-effects';

/**
 * LEAVE subject of the approval engine (FR-LV-11). Approval (after the last required level) marks the request
 * APPROVED, posts its usage to the balance ledger and recomputes the attendance of its dates so they show LEAVE;
 * rejection marks it REJECTED and ends the absence delegation filed with it. The engine notifies the requester.
 */
export const leaveApprovalHandler: ApprovalSubjectHandler = {
  subjectType: ApprovalSubjectType.LEAVE,

  async summarize(tx, workspaceId, subjectIds, locale) {
    const rows = await tx.leaveRequest.findMany({
      where: { workspaceId, id: { in: subjectIds } },
      select: { id: true, startDate: true, endDate: true, halfDay: true, days: true, reason: true, leaveType: { select: { nameLo: true, nameEn: true } } },
    });
    return new Map(
      rows.map((r): [string, ApprovalSummary] => {
        const dates = leaveDatesLabel(locale, r);
        return [
          r.id,
          {
            title: interpolate(translate(locale, 'approval.summary.leave.title'), {
              leaveType: locale === 'en' ? r.leaveType.nameEn : r.leaveType.nameLo,
              days: roundLeaveDays(Number(r.days)),
            }),
            detail: r.reason ? `${dates} · ${r.reason}` : dates,
          },
        ];
      }),
    );
  },

  async onApproved(tx, { workspaceId, subjectId, actorUserId }) {
    const leave = await tx.leaveRequest.update({ where: { id: subjectId, workspaceId }, data: { status: 'APPROVED' } });
    await leaveLedger.postUsage(tx, workspaceId, subjectId, actorUserId);
    await recomputeLeaveAttendance(tx, workspaceId, leave);
  },

  async onRejected(tx, { workspaceId, subjectId, actorUserId }) {
    const leave = await tx.leaveRequest.update({ where: { id: subjectId, workspaceId }, data: { status: 'REJECTED' } });
    await cancelLeaveDelegation(tx, workspaceId, leave, actorUserId);
  },

  teamOnLeave: (tx, workspaceId, subjectId) => teamOnLeaveFor(tx, workspaceId, subjectId),

  link: (request) => approvalLink(request.id),
};
