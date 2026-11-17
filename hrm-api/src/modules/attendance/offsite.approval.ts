import { ApprovalSubjectType, interpolate, localDateTimeOf, translate, type ApprovalSummary } from '@hrm/shared';
import type { Tx } from '../../db/client';
import { toIsoDate } from '../../lib/dates';
import { approvalLink, type ApprovalOutcome, type ApprovalSubjectHandler } from '../approvals/approval-handlers';
import { recomputeAttendanceDays } from './attendance-days';
import { workspaceTimeZone } from './day-context';

const hhmm = (minuteOfDay: number) => `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;

/** Record the manager's decision on the punch and rebuild its day (a rejected punch stops counting). */
const decide = async (tx: Tx, { workspaceId, subjectId, actorUserId, note }: ApprovalOutcome, approved: boolean, now = new Date()) => {
  const punch = await tx.attendancePunch.findFirst({ where: { id: subjectId, workspaceId } });
  if (!punch) return;
  // A punch that is also suspicious stays PENDING for the attendance.review queue after the manager accepts the
  // location (FR-ATT-14); a rejection is final either way.
  const reviewStatus = approved ? (punch.suspicious ? 'PENDING' : 'APPROVED') : 'REJECTED';
  await tx.attendancePunch.update({
    where: { id: punch.id },
    data: { reviewStatus, reviewedById: actorUserId, reviewedAt: now, reviewNote: note },
  });
  await recomputeAttendanceDays(tx, workspaceId, punch.employeeId, [toIsoDate(punch.workDate)!], now);
};

/**
 * OFFSITE_CHECKIN subject (FR-ATT-16.3): an out-of-zone punch made under an off-site permission waits for the
 * manager. Approve → the punch is APPROVED; reject → REJECTED and the day is recomputed without it.
 */
export const offsiteCheckinApprovalHandler: ApprovalSubjectHandler = {
  subjectType: ApprovalSubjectType.OFFSITE_CHECKIN,

  async summarize(tx, workspaceId, subjectIds, locale) {
    const [timeZone, rows] = await Promise.all([
      workspaceTimeZone(tx, workspaceId),
      tx.attendancePunch.findMany({
        where: { workspaceId, id: { in: subjectIds } },
        select: { id: true, kind: true, capturedAt: true, offsiteReason: true, distanceMetres: true },
      }),
    ]);
    return new Map(
      rows.map((r): [string, ApprovalSummary] => {
        const local = localDateTimeOf(r.capturedAt, timeZone);
        return [
          r.id,
          {
            title: interpolate(translate(locale, 'approval.summary.offsite.title'), {
              kind: translate(locale, `attendance.kind.${r.kind}`),
              date: local.date,
              time: hhmm(local.minuteOfDay),
            }),
            detail: interpolate(translate(locale, 'approval.summary.offsite.detail'), {
              reason: r.offsiteReason ?? '',
              metres: Math.round(r.distanceMetres ?? 0),
            }),
          },
        ];
      }),
    );
  },

  onApproved: (tx, outcome) => decide(tx, outcome, true),
  onRejected: (tx, outcome) => decide(tx, outcome, false),

  link: (request) => approvalLink(request.id),
};
