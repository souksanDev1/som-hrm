import { ApprovalSubjectType, formatDurationMinutes, interpolate, translate, type ApprovalSummary } from '@hrm/shared';
import { workspaceTimeZone } from '../attendance/day-context';
import { approvalLink, type ApprovalSubjectHandler } from '../approvals/approval-handlers';
import { settleOvertimeActuals } from './overtime.actuals';
import { toOvertimeView } from './overtime.view';

/**
 * OVERTIME subject of the approval engine (FR-ATT-20.3): summary = date, times, total and the four categories;
 * approval flips the status and settles the actual period when the day's punches are already final.
 */
export const overtimeApprovalHandler: ApprovalSubjectHandler = {
  subjectType: ApprovalSubjectType.OVERTIME,

  async summarize(tx, workspaceId, subjectIds, locale) {
    const [timeZone, rows] = await Promise.all([
      workspaceTimeZone(tx, workspaceId),
      tx.overtimeRequest.findMany({
        where: { workspaceId, id: { in: subjectIds } },
        include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
      }),
    ]);
    return new Map(
      rows.map((r): [string, ApprovalSummary] => {
        const v = toOvertimeView(r, timeZone, null);
        return [
          r.id,
          {
            title: interpolate(translate(locale, 'otx.summary.title'), {
              kind: translate(locale, `otx.kind.${v.kind}`),
              date: v.workDate,
              start: v.actualStartTime ?? v.plannedStartTime,
              end: v.actualEndTime ?? v.plannedEndTime,
            }),
            detail: interpolate(translate(locale, 'otx.summary.detail'), {
              total: formatDurationMinutes(v.minutes),
              workdayDay: formatDurationMinutes(v.workdayDayMinutes),
              workdayNight: formatDurationMinutes(v.workdayNightMinutes),
              holidayDay: formatDurationMinutes(v.holidayDayMinutes),
              holidayNight: formatDurationMinutes(v.holidayNightMinutes),
              reason: v.reason,
            }),
          },
        ];
      }),
    );
  },

  async onApproved(tx, { workspaceId, subjectId }) {
    await tx.overtimeRequest.updateMany({ where: { id: subjectId, workspaceId, status: 'PENDING' }, data: { status: 'APPROVED', decidedAt: new Date() } });
    await settleOvertimeActuals(tx, workspaceId, new Date(), [subjectId]);
  },

  async onRejected(tx, { workspaceId, subjectId }) {
    await tx.overtimeRequest.updateMany({ where: { id: subjectId, workspaceId, status: 'PENDING' }, data: { status: 'REJECTED', decidedAt: new Date() } });
  },

  link: (request) => approvalLink(request.id),
};

