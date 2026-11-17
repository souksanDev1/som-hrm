import { ApprovalSubjectType, interpolate, translate, type ApprovalSummary, type PunchKind } from '@hrm/shared';
import type { Tx } from '../../db/client';
import { toIsoDate } from '../../lib/dates';
import { approvalLink, type ApprovalSubjectHandler } from '../approvals/approval-handlers';
import { attendanceRequestsRepository as repo } from './attendance-requests.repository';
import { localTimeOn } from './attendance-requests.mapper';
import { workspaceTimeZone } from './day-context';
import { createPunches, type NewPunch } from './punches';

/**
 * Apply an approved correction (FR-ATT-19.2/19.3): add a CORRECTION punch for each requested time on the corrected
 * work date and supersede every counted punch of that kind on that day, keeping the originals (`supersededAt` +
 * `supersededById` = the new punch). The day is recomputed by `createPunches` after the originals stop counting.
 */
const applyCorrection = async (tx: Tx, workspaceId: string, correctionId: string, now: Date) => {
  const c = await tx.attendanceCorrection.findFirst({ where: { id: correctionId, workspaceId }, include: { employee: { select: { branchId: true } } } });
  if (!c || c.status !== 'PENDING') return;
  const workDate = toIsoDate(c.workDate)!;
  const sides = ([['IN', c.requestedCheckIn], ['OUT', c.requestedCheckOut]] as const).filter((s): s is readonly [PunchKind, Date] => !!s[1]);

  const originals = new Map<PunchKind, string[]>();
  for (const [kind] of sides) {
    const ids = (await repo.countedPunches(tx, workspaceId, c.employeeId, c.workDate, kind)).map((p) => p.id);
    originals.set(kind, ids);
    if (ids.length) await tx.attendancePunch.updateMany({ where: { id: { in: ids } }, data: { supersededAt: now } });
  }

  const punches: NewPunch[] = sides.map(([kind, at]) => ({
    employeeId: c.employeeId,
    kind,
    capturedAt: at,
    source: 'CORRECTION',
    workDate,
    branchId: c.employee.branchId,
    createdById: c.createdById,
    reason: c.reason,
  }));
  const { created } = await createPunches(tx, workspaceId, punches, now);
  for (const punch of created) {
    const ids = originals.get(punch.kind) ?? [];
    if (ids.length) await tx.attendancePunch.updateMany({ where: { id: { in: ids } }, data: { supersededById: punch.id } });
  }
  await tx.attendanceCorrection.update({ where: { id: c.id }, data: { status: 'APPROVED', decidedAt: now } });
};

/** ATTENDANCE_CORRECTION subject: routed along the chain of command; the inbox shows original vs requested times. */
export const correctionApprovalHandler: ApprovalSubjectHandler = {
  subjectType: ApprovalSubjectType.ATTENDANCE_CORRECTION,

  async summarize(tx, workspaceId, subjectIds, locale) {
    const rows = await tx.attendanceCorrection.findMany({ where: { workspaceId, id: { in: subjectIds } } });
    const timeZone = await workspaceTimeZone(tx, workspaceId);
    const originals = new Map(
      (await repo.punchesByIds(tx, workspaceId, rows.flatMap((r) => [r.originalInPunchId, r.originalOutPunchId]).filter((v): v is string => !!v))).map((p) => [
        p.id,
        p.capturedAt,
      ]),
    );
    return new Map(
      rows.map((r): [string, ApprovalSummary] => {
        const date = toIsoDate(r.workDate)!;
        const time = (d: Date | null | undefined) => localTimeOn(d, date, timeZone) ?? '—';
        const parts = [
          r.requestedCheckIn
            ? interpolate(translate(locale, 'attreq.summary.correction.in'), { from: time(r.originalInPunchId ? originals.get(r.originalInPunchId) : null), to: time(r.requestedCheckIn) })
            : null,
          r.requestedCheckOut
            ? interpolate(translate(locale, 'attreq.summary.correction.out'), { from: time(r.originalOutPunchId ? originals.get(r.originalOutPunchId) : null), to: time(r.requestedCheckOut) })
            : null,
          r.reason,
        ].filter((v): v is string => !!v);
        return [r.id, { title: interpolate(translate(locale, 'attreq.summary.correction.title'), { date }), detail: parts.join(' · ') }];
      }),
    );
  },

  async onApproved(tx, { workspaceId, subjectId }) {
    await applyCorrection(tx, workspaceId, subjectId, new Date());
  },

  async onRejected(tx, { workspaceId, subjectId }) {
    await tx.attendanceCorrection.updateMany({ where: { id: subjectId, workspaceId, status: 'PENDING' }, data: { status: 'REJECTED', decidedAt: new Date() } });
  },

  link: (request) => approvalLink(request.id),
};
