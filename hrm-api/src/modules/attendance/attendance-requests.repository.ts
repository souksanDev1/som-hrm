import type { PunchKind } from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';

const employeeRef = { select: { id: true, employeeCode: true, firstName: true, lastName: true } } as const;

export const reviewPunchInclude = { employee: employeeRef, branch: { select: { id: true, name: true } } } as const;
export type ReviewPunchRow = Prisma.AttendancePunchGetPayload<{ include: typeof reviewPunchInclude }>;

export const offsiteInclude = { employee: employeeRef } as const;
export type OffsiteRow = Prisma.OffsitePermissionGetPayload<{ include: typeof offsiteInclude }>;

export const correctionInclude = { employee: employeeRef } as const;
export type CorrectionRow = Prisma.AttendanceCorrectionGetPayload<{ include: typeof correctionInclude }>;

/** `null` scope = the whole workspace; otherwise only these employees. */
const inScope = (scope: string[] | null) => (scope ? { employeeId: { in: scope } } : {});

/** A punch that counts for its day: not superseded by a correction and not rejected in review (`punchCounts`). */
const counted = { supersededAt: null, reviewStatus: { not: 'REJECTED' as const } };

/** Data access of the HR attendance tools and employee attendance requests (M5 agent D). */
export const attendanceRequestsRepository = {
  // ── Review queue (FR-ATT-14) ──
  reviewQueue: async (tx: Tx, workspaceId: string, scope: string[] | null, page: { skip: number; take: number }) => {
    const where: Prisma.AttendancePunchWhereInput = { workspaceId, suspicious: true, reviewStatus: 'PENDING', ...inScope(scope) };
    const [items, total] = await Promise.all([
      tx.attendancePunch.findMany({ where, include: reviewPunchInclude, orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }], ...page }),
      tx.attendancePunch.count({ where }),
    ]);
    return { items, total };
  },

  findPunch: (tx: Tx, workspaceId: string, id: string) => tx.attendancePunch.findFirst({ where: { id, workspaceId }, include: reviewPunchInclude }),

  /** Decide a pending review; false when someone else decided it first. */
  decideReview: async (tx: Tx, id: string, data: { reviewStatus: 'APPROVED' | 'REJECTED'; reviewedById: string; reviewedAt: Date; reviewNote: string | null }) =>
    (await tx.attendancePunch.updateMany({ where: { id, reviewStatus: 'PENDING' }, data })).count === 1,

  /** Counted punches of one kind on a work date, oldest first. */
  countedPunches: (tx: Tx, workspaceId: string, employeeId: string, workDate: Date, kind?: PunchKind) =>
    tx.attendancePunch.findMany({
      where: { workspaceId, employeeId, workDate, ...(kind ? { kind } : {}), ...counted },
      orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
    }),

  punchesByIds: (tx: Tx, workspaceId: string, ids: string[]) =>
    ids.length ? tx.attendancePunch.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, capturedAt: true } }) : Promise.resolve([]),

  employee: (tx: Tx, workspaceId: string, id: string) =>
    tx.employee.findFirst({ where: { id, workspaceId }, select: { id: true, employeeCode: true, firstName: true, lastName: true, branchId: true } }),

  // ── Off-site permissions (FR-ATT-16.1) ──
  offsiteList: async (
    tx: Tx,
    workspaceId: string,
    filter: { scope: string[] | null; employeeId?: string; activeFrom?: Date },
    page: { skip: number; take: number },
  ) => {
    const where: Prisma.OffsitePermissionWhereInput = {
      workspaceId,
      AND: [inScope(filter.scope), filter.employeeId ? { employeeId: filter.employeeId } : {}],
      ...(filter.activeFrom ? { revokedAt: null, toDate: { gte: filter.activeFrom } } : {}),
    };
    const [items, total] = await Promise.all([
      tx.offsitePermission.findMany({ where, include: offsiteInclude, orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }], ...page }),
      tx.offsitePermission.count({ where }),
    ]);
    return { items, total };
  },

  offsiteOverlap: (tx: Tx, workspaceId: string, employeeId: string, from: Date, to: Date) =>
    tx.offsitePermission.findFirst({ where: { workspaceId, employeeId, revokedAt: null, fromDate: { lte: to }, toDate: { gte: from } } }),

  findOffsite: (tx: Tx, workspaceId: string, id: string) => tx.offsitePermission.findFirst({ where: { id, workspaceId }, include: offsiteInclude }),

  // ── Devices (FR-ATT-11) ──
  userOfEmployee: (tx: Tx, workspaceId: string, employeeId: string) =>
    tx.user.findFirst({ where: { workspaceId, employeeId }, select: { id: true } }),

  bindingsOf: (tx: Tx, workspaceId: string, userId: string) =>
    tx.deviceBinding.findMany({ where: { workspaceId, userId }, orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] }),

  findBinding: (tx: Tx, workspaceId: string, id: string) =>
    tx.deviceBinding.findFirst({ where: { id, workspaceId }, include: { user: { select: { employeeId: true } } } }),

  deviceRequestsOf: (tx: Tx, workspaceId: string, employeeId: string) =>
    tx.deviceChangeRequest.findMany({ where: { workspaceId, employeeId }, orderBy: { createdAt: 'desc' }, take: 50 }),

  pendingDeviceRequest: (tx: Tx, workspaceId: string, employeeId: string) =>
    tx.deviceChangeRequest.findFirst({ where: { workspaceId, employeeId, status: 'PENDING' } }),

  // ── Corrections (FR-ATT-19) ──
  pendingCorrection: (tx: Tx, workspaceId: string, employeeId: string, workDate: Date) =>
    tx.attendanceCorrection.findFirst({ where: { workspaceId, employeeId, workDate, status: 'PENDING' } }),

  correctionsOf: (tx: Tx, workspaceId: string, employeeId: string) =>
    tx.attendanceCorrection.findMany({ where: { workspaceId, employeeId }, include: correctionInclude, orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }], take: 50 }),

  ownAttachment: (tx: Tx, workspaceId: string, id: string, uploadedById: string) =>
    tx.storedFile.findFirst({ where: { id, workspaceId, purpose: 'ATTACHMENT', uploadedById } }),

  filesByIds: (tx: Tx, workspaceId: string, ids: string[]) =>
    ids.length
      ? tx.storedFile.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true } })
      : Promise.resolve([]),

  /** Approval request id per subject id (null when the subject was never submitted). */
  approvalIds: async (tx: Tx, workspaceId: string, subjectType: 'ATTENDANCE_CORRECTION' | 'DEVICE_CHANGE', subjectIds: string[]) =>
    new Map(
      subjectIds.length
        ? (
            await tx.approvalRequest.findMany({ where: { workspaceId, subjectType, subjectId: { in: subjectIds } }, select: { id: true, subjectId: true } })
          ).map((r) => [r.subjectId, r.id])
        : [],
    ),
};
