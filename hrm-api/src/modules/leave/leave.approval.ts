import { ApprovalSubjectType, interpolate, translate, type ApprovalSummary } from '@hrm/shared';
import { toIsoDate } from '../../lib/dates';
import { approvalLink, type ApprovalSubjectHandler } from '../approvals/approval-handlers';

/**
 * LEAVE subject of the approval engine. M4 keeps it minimal (it flips `LeaveRequest.status`) so the
 * inbox works before leave filing exists; M6 extends it (balances, attendance, cancellation).
 */
export const leaveApprovalHandler: ApprovalSubjectHandler = {
  subjectType: ApprovalSubjectType.LEAVE,

  async summarize(tx, workspaceId, subjectIds, locale) {
    const rows = await tx.leaveRequest.findMany({
      where: { workspaceId, id: { in: subjectIds } },
      select: { id: true, startDate: true, endDate: true, days: true, reason: true, leaveType: { select: { nameLo: true, nameEn: true } } },
    });
    return new Map(
      rows.map((r): [string, ApprovalSummary] => {
        const params = { start: toIsoDate(r.startDate)!, end: toIsoDate(r.endDate)!, reason: r.reason ?? '' };
        return [
          r.id,
          {
            title: interpolate(translate(locale, 'approval.summary.leave.title'), {
              leaveType: locale === 'en' ? r.leaveType.nameEn : r.leaveType.nameLo,
              days: Number(r.days),
            }),
            detail: interpolate(translate(locale, r.reason ? 'approval.summary.leave.detailReason' : 'approval.summary.leave.detail'), params),
          },
        ];
      }),
    );
  },

  async onApproved(tx, { workspaceId, subjectId }) {
    await tx.leaveRequest.updateMany({ where: { id: subjectId, workspaceId }, data: { status: 'APPROVED' } });
  },

  async onRejected(tx, { workspaceId, subjectId }) {
    await tx.leaveRequest.updateMany({ where: { id: subjectId, workspaceId }, data: { status: 'REJECTED' } });
  },

  link: (request) => approvalLink(request.id),
};
