import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';
import { parseIsoDate } from '../../lib/dates';

/** Requests that use up the OT caps and block overlapping requests (FR-ATT-22). */
export const COUNTED_STATUSES = ['PENDING', 'APPROVED'] as const;

const withEmployee = { employee: { select: { employeeCode: true, firstName: true, lastName: true } } } as const;
export type OvertimeRow = Prisma.OvertimeRequestGetPayload<{ include: typeof withEmployee }>;

/** First and last calendar day of a "YYYY-MM" month as @db.Date values. */
export const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: parseIsoDate(`${month}-01`), to: parseIsoDate(`${month}-${String(last).padStart(2, '0')}`) };
};

export const overtimeRepository = {
  /** Serialise OT filings of one employee so two concurrent requests cannot both pass the caps. */
  lockEmployee: (tx: Tx, workspaceId: string, employeeId: string) =>
    tx.$queryRaw`SELECT 1 FROM "Employee" WHERE "id" = ${employeeId} AND "workspaceId" = ${workspaceId} FOR UPDATE`,

  /** Minutes already counted (pending + approved) on a work date range, excluding one request. */
  usedMinutes: async (tx: Tx, workspaceId: string, employeeId: string, from: Date, to: Date, excludeId?: string): Promise<number> =>
    (
      await tx.overtimeRequest.aggregate({
        where: { workspaceId, employeeId, status: { in: [...COUNTED_STATUSES] }, workDate: { gte: from, lte: to }, ...(excludeId ? { id: { not: excludeId } } : {}) },
        _sum: { minutes: true },
      })
    )._sum.minutes ?? 0,

  /** A pending or approved request of the employee whose planned period overlaps [start, end). */
  findOverlapping: (tx: Tx, workspaceId: string, employeeId: string, start: Date, end: Date, excludeId?: string) =>
    tx.overtimeRequest.findFirst({
      where: {
        workspaceId,
        employeeId,
        status: { in: [...COUNTED_STATUSES] },
        plannedStart: { lt: end },
        plannedEnd: { gt: start },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    }),

  create: (tx: Tx, data: Prisma.OvertimeRequestUncheckedCreateInput) => tx.overtimeRequest.create({ data, include: withEmployee }),

  findById: (tx: Tx, workspaceId: string, id: string) => tx.overtimeRequest.findFirst({ where: { workspaceId, id }, include: withEmployee }),

  /** Requests of a month (by work date), newest first; `employeeIds = null` = the whole workspace. */
  listMonth: (tx: Tx, workspaceId: string, month: string, employeeIds: string[] | null) => {
    const { from, to } = monthRange(month);
    return tx.overtimeRequest.findMany({
      where: { workspaceId, workDate: { gte: from, lte: to }, ...(employeeIds ? { employeeId: { in: employeeIds } } : {}) },
      include: withEmployee,
      orderBy: [{ workDate: 'desc' }, { plannedStart: 'desc' }],
    });
  },

  /** Approval request id of each OT request (for links to the approval detail). */
  approvalIds: async (tx: Tx, workspaceId: string, subjectIds: string[]): Promise<Map<string, string>> => {
    if (!subjectIds.length) return new Map();
    const rows = await tx.approvalRequest.findMany({
      where: { workspaceId, subjectType: 'OVERTIME', subjectId: { in: subjectIds } },
      select: { id: true, subjectId: true },
    });
    return new Map(rows.map((r) => [r.subjectId, r.id]));
  },

  /** Approved planned (PRE) requests whose actual period is not settled yet and that ended before `endedBefore`. */
  unsettledApproved: (tx: Tx, workspaceId: string, endedBefore: Date, ids?: string[]) =>
    tx.overtimeRequest.findMany({
      where: { workspaceId, kind: 'PRE', status: 'APPROVED', actualStart: null, plannedEnd: { lte: endedBefore }, ...(ids ? { id: { in: ids } } : {}) },
    }),
};
