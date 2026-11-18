import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';
import { parseIsoDate } from '../../lib/dates';

/** Requests that hold days and block another request on the same dates. */
export const ACTIVE_LEAVE_STATUSES = ['PENDING', 'APPROVED'] as const;

export const leaveRequestInclude = {
  employee: { select: { employeeCode: true, firstName: true, lastName: true } },
  leaveType: { select: { id: true, code: true, nameLo: true, nameEn: true } },
  cancelRequests: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, reason: true } },
} satisfies Prisma.LeaveRequestInclude;
export type LeaveRequestRow = Prisma.LeaveRequestGetPayload<{ include: typeof leaveRequestInclude }>;

export interface LeaveRequestFilter {
  /** `null` = the whole workspace. */
  employeeIds: string[] | null;
  status?: Prisma.LeaveRequestWhereInput['status'];
  year?: number;
}

export const leaveRequestsRepository = {
  /** Serialise filings of one employee so two concurrent requests cannot both pass the balance check. */
  lockEmployee: (tx: Tx, workspaceId: string, employeeId: string) =>
    tx.$queryRaw`SELECT 1 FROM "Employee" WHERE "id" = ${employeeId} AND "workspaceId" = ${workspaceId} FOR UPDATE`,

  /** A pending or approved request of the employee sharing at least one date with [start, end]. */
  findOverlapping: (tx: Tx, workspaceId: string, employeeId: string, start: string, end: string) =>
    tx.leaveRequest.findFirst({
      where: {
        workspaceId,
        employeeId,
        status: { in: [...ACTIVE_LEAVE_STATUSES] },
        startDate: { lte: parseIsoDate(end) },
        endDate: { gte: parseIsoDate(start) },
      },
      select: { id: true },
    }),

  create: (tx: Tx, data: Prisma.LeaveRequestUncheckedCreateInput) => tx.leaveRequest.create({ data, include: leaveRequestInclude }),

  findById: (tx: Tx, workspaceId: string, id: string) => tx.leaveRequest.findFirst({ where: { workspaceId, id }, include: leaveRequestInclude }),

  update: (tx: Tx, id: string, data: Prisma.LeaveRequestUncheckedUpdateInput) => tx.leaveRequest.update({ where: { id }, data, include: leaveRequestInclude }),

  list: (tx: Tx, workspaceId: string, f: LeaveRequestFilter) =>
    tx.leaveRequest.findMany({
      where: {
        workspaceId,
        ...(f.employeeIds ? { employeeId: { in: f.employeeIds } } : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(f.year ? { startDate: { lte: parseIsoDate(`${f.year}-12-31`) }, endDate: { gte: parseIsoDate(`${f.year}-01-01`) } } : {}),
      },
      include: leaveRequestInclude,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    }),

  /** Approval request ids of leave requests and of their cancellations (subject LEAVE / LEAVE_CANCEL). */
  approvalIds: async (tx: Tx, workspaceId: string, subjectIds: string[]): Promise<Map<string, string>> => {
    if (!subjectIds.length) return new Map();
    const rows = await tx.approvalRequest.findMany({
      where: { workspaceId, subjectType: { in: ['LEAVE', 'LEAVE_CANCEL'] }, subjectId: { in: subjectIds } },
      select: { id: true, subjectId: true },
    });
    return new Map(rows.map((r) => [r.subjectId, r.id]));
  },

  /** Display names of the users who filed the requests. */
  userNames: async (tx: Tx, workspaceId: string, ids: string[]): Promise<Map<string, string>> => {
    if (!ids.length) return new Map();
    const rows = await tx.user.findMany({ where: { workspaceId, id: { in: [...new Set(ids)] } }, select: { id: true, displayName: true } });
    return new Map(rows.map((u) => [u.id, u.displayName]));
  },

  /** True when the user owns / is delegated / decided a step of the request's approval. */
  isApprover: async (tx: Tx, workspaceId: string, leaveRequestId: string, userId: string) =>
    (await tx.approvalStep.count({
      where: {
        workspaceId,
        request: { subjectType: 'LEAVE', subjectId: leaveRequestId },
        OR: [{ approverUserId: userId }, { delegateUserId: userId }, { decidedByUserId: userId }],
      },
    })) > 0,

  /** The caller's own stand-alone ATTACHMENT upload (only the uploader may link it, FR-LV-05.3). */
  ownAttachment: (tx: Tx, workspaceId: string, id: string, uploadedById: string) =>
    tx.storedFile.findFirst({ where: { id, workspaceId, purpose: 'ATTACHMENT', uploadedById }, select: { id: true } }),

  /** Open requests still missing a required certificate whose leave ended before `today` (certificate-due job). */
  missingCertificates: (tx: Tx, workspaceId: string, today: string) =>
    tx.leaveRequest.findMany({
      where: {
        workspaceId,
        status: { in: [...ACTIVE_LEAVE_STATUSES] },
        certificateFileId: null,
        certificateDueDate: { not: null },
        endDate: { lt: parseIsoDate(today) },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        certificateDueDate: true,
        submittedByUserId: true,
        employee: { select: { user: { select: { id: true, isActive: true } } } },
      },
    }),
};
