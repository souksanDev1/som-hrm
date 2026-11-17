import {
  isoDateInTimeZone,
  parseTimeOfDay,
  zonedInstant,
  type Correction,
  type CreateCorrectionInput,
  type CreateDeviceChangeInput,
  type CreateOffsitePermissionInput,
  type DeviceChangeRequest,
  type EmployeeDevices,
  type OffsitePermission,
  type OffsitePermissionQuery,
  type OnBehalfPunchInput,
  type Paginated,
  type ReviewDecisionInput,
  type ReviewPunch,
  type ReviewQueueQuery,
} from '@hrm/shared';
import type { AttendancePunch } from '@prisma/client';
import type { Db, Tx } from '../../db/client';
import { parseIsoDate } from '../../lib/dates';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import type { ApprovalHandlerRegistry } from '../approvals/approval-handlers';
import { submitApproval } from '../approvals/approvals.service';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { employeeAccess } from '../employees/employees.service';
import { parametersRepository } from '../parameters/parameters.repository';
import { recomputeAttendanceDays } from './attendance-days';
import { attendanceRequestsRepository as repo, type CorrectionRow, type OffsiteRow } from './attendance-requests.repository';
import { localStamp, toBinding, toCorrection, toDeviceRequest, toOffsite, toReviewPunch } from './attendance-requests.mapper';
import { workspaceTimeZone } from './day-context';
import { createPunches } from './punches';

interface RequestMeta {
  ip?: string;
}

const MINUTES_PER_DAY = 24 * 60;
const page = (q: { page: number; pageSize: number }) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

/** Workspace time zone and today's date there. */
const clockOf = async (tx: Tx, workspaceId: string, now: Date) => {
  const timeZone = await workspaceTimeZone(tx, workspaceId);
  return { timeZone, today: isoDateInTimeZone(timeZone, now) };
};

/** The caller's own employee record; attendance requests are filed by employees only. */
const ownEmployeeId = (ctx: AuthContext): string => {
  if (!ctx.employeeId) throw forbidden('employee_required');
  return ctx.employeeId;
};

/** 404 unless the employee exists and is inside the caller's data scope (HR: workspace, manager: tree, else self). */
const assertInScope = async (tx: Tx, ctx: AuthContext, employeeId: string) => {
  await employeeAccess.assertCanRead(tx, ctx, employeeId);
  const employee = await repo.employee(tx, ctx.workspaceId, employeeId);
  if (!employee) throw notFound();
  return employee;
};

/** "HH:mm" on `workDate` in the workspace zone, `extraDays` later. */
const instantOn = (workDate: string, hhmm: string, timeZone: string, extraDays = 0) =>
  zonedInstant(workDate, parseTimeOfDay(hhmm)! + extraDays * MINUTES_PER_DAY, timeZone);

/**
 * HR attendance tools and employee attendance requests (M5 agent D): suspicious-punch review (FR-ATT-14), punches
 * on behalf (FR-ATT-04), off-site permissions (FR-ATT-16.1), device change (FR-ATT-11.2/11.3) and time corrections
 * (FR-ATT-19). Every punch goes through `createPunches`; every decision recomputes the affected day.
 */
export const createAttendanceRequestsService = (db: Db, registry: ApprovalHandlerRegistry) => {
  const offsiteView = async (tx: Tx, rows: OffsiteRow[], today: string) => {
    const names = await parametersRepository.userNames(tx, [...new Set(rows.flatMap((r) => (r.grantedById ? [r.grantedById] : [])))]);
    return rows.map((r) => toOffsite(r, today, r.grantedById ? (names.get(r.grantedById) ?? null) : null));
  };

  const correctionView = async (tx: Tx, workspaceId: string, rows: CorrectionRow[]): Promise<Correction[]> => {
    const timeZone = await workspaceTimeZone(tx, workspaceId);
    const punchIds = rows.flatMap((r) => [r.originalInPunchId, r.originalOutPunchId]).filter((v): v is string => !!v);
    const originals = new Map((await repo.punchesByIds(tx, workspaceId, punchIds)).map((p) => [p.id, p.capturedAt]));
    const files = new Map((await repo.filesByIds(tx, workspaceId, rows.flatMap((r) => (r.attachmentFileId ? [r.attachmentFileId] : [])))).map((f) => [f.id, f]));
    const approvals = await repo.approvalIds(tx, workspaceId, 'ATTENDANCE_CORRECTION', rows.map((r) => r.id));
    return rows.map((r) =>
      toCorrection(r, timeZone, originals, r.attachmentFileId ? (files.get(r.attachmentFileId) ?? null) : null, approvals.get(r.id) ?? null),
    );
  };

  const deviceRequestsView = async (tx: Tx, workspaceId: string, employeeId: string): Promise<DeviceChangeRequest[]> => {
    const rows = await repo.deviceRequestsOf(tx, workspaceId, employeeId);
    const approvals = await repo.approvalIds(tx, workspaceId, 'DEVICE_CHANGE', rows.map((r) => r.id));
    return rows.map((r) => toDeviceRequest(r, approvals.get(r.id) ?? null));
  };

  return {
    // ───────────────────────── Suspicious-punch review (FR-ATT-14) ─────────────────────────

    /** Suspicious punches waiting for review, oldest first, within the caller's data scope. */
    reviewQueue: (ctx: AuthContext, q: ReviewQueueQuery): Promise<Paginated<ReviewPunch>> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const scope = await employeeAccess.scope(tx, ctx);
        const timeZone = await workspaceTimeZone(tx, ctx.workspaceId);
        const { items, total } = await repo.reviewQueue(tx, ctx.workspaceId, scope, page(q));
        return { items: items.map((p) => toReviewPunch(p, timeZone)), total, page: q.page, pageSize: q.pageSize };
      }),

    /** Approve (the punch keeps counting) or reject (dropped from the day) a suspicious punch; recomputes its day. */
    decideReview: (ctx: AuthContext, punchId: string, input: ReviewDecisionInput, meta: RequestMeta): Promise<ReviewPunch> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        const punch = await repo.findPunch(tx, ws, punchId);
        if (!punch || !punch.suspicious || !(await employeeAccess.canRead(tx, ctx, punch.employeeId))) throw notFound();
        const now = new Date();
        const note = input.note?.trim() || null;
        if (punch.reviewStatus !== 'PENDING' || !(await repo.decideReview(tx, punch.id, { reviewStatus: input.decision, reviewedById: ctx.userId, reviewedAt: now, reviewNote: note }))) {
          throw conflict('review_already_decided');
        }
        await auditRepository.create(tx, {
          workspaceId: ws,
          actorUserId: ctx.userId,
          action: input.decision === 'APPROVED' ? 'attendance.review_approve' : 'attendance.review_reject',
          entity: 'AttendancePunch',
          entityId: punch.id,
          meta: { employeeId: punch.employeeId, workDate: punch.workDate.toISOString().slice(0, 10), reasons: punch.suspiciousReasons, note },
          ip: meta.ip,
        });
        await recomputeAttendanceDays(tx, ws, punch.employeeId, [punch.workDate.toISOString().slice(0, 10)], now);
        return toReviewPunch((await repo.findPunch(tx, ws, punch.id))!, await workspaceTimeZone(tx, ws));
      }),

    // ───────────────────────── HR on behalf (FR-ATT-04) ─────────────────────────

    /** Record a punch for an employee in scope (source HR_ON_BEHALF, who + why kept on the punch and audited). */
    punchOnBehalf: (ctx: AuthContext, input: OnBehalfPunchInput, meta: RequestMeta): Promise<ReviewPunch> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        const employee = await assertInScope(tx, ctx, input.employeeId);
        const now = new Date();
        const { timeZone } = await clockOf(tx, ws, now);
        const capturedAt = instantOn(input.capturedAt.slice(0, 10), input.capturedAt.slice(11), timeZone);
        if (capturedAt > now) throw badRequest('punch_in_future', { field: 'capturedAt' });
        const { created } = await createPunches(
          tx,
          ws,
          [{ employeeId: employee.id, kind: input.kind, capturedAt, source: 'HR_ON_BEHALF', branchId: employee.branchId, createdById: ctx.userId, reason: input.reason }],
          now,
        );
        const punch = created[0]!;
        await auditRepository.create(tx, {
          workspaceId: ws,
          actorUserId: ctx.userId,
          action: 'attendance.punch_on_behalf',
          entity: 'AttendancePunch',
          entityId: punch.id,
          meta: { employeeId: employee.id, kind: input.kind, capturedAt: capturedAt.toISOString(), workDate: punch.workDate.toISOString().slice(0, 10), reason: input.reason },
          ip: meta.ip,
        });
        return toReviewPunch((await repo.findPunch(tx, ws, punch.id))!, timeZone);
      }),

    // ───────────────────────── Off-site permissions (FR-ATT-16.1) ─────────────────────────

    listOffsite: (ctx: AuthContext, q: OffsitePermissionQuery): Promise<Paginated<OffsitePermission>> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const { today } = await clockOf(tx, ctx.workspaceId, new Date());
        const scope = await employeeAccess.scope(tx, ctx);
        const filter = { scope, employeeId: q.employeeId, activeFrom: q.includeInactive ? undefined : parseIsoDate(today) };
        const { items, total } = await repo.offsiteList(tx, ctx.workspaceId, filter, page(q));
        return { items: await offsiteView(tx, items, today), total, page: q.page, pageSize: q.pageSize };
      }),

    /** The caller's own permissions still in force or upcoming (so the app can offer an off-site check-in). */
    myOffsite: (ctx: AuthContext): Promise<OffsitePermission[]> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        if (!ctx.employeeId) return [];
        const { today } = await clockOf(tx, ctx.workspaceId, new Date());
        const { items } = await repo.offsiteList(tx, ctx.workspaceId, { scope: [ctx.employeeId], activeFrom: parseIsoDate(today) }, { skip: 0, take: 50 });
        return offsiteView(tx, items, today);
      }),

    createOffsite: (ctx: AuthContext, input: CreateOffsitePermissionInput, meta: RequestMeta): Promise<OffsitePermission> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        await assertInScope(tx, ctx, input.employeeId);
        const { today } = await clockOf(tx, ws, new Date());
        if (input.toDate < today) throw badRequest('offsite_in_past', { field: 'toDate' });
        const from = parseIsoDate(input.fromDate);
        const to = parseIsoDate(input.toDate);
        if (await repo.offsiteOverlap(tx, ws, input.employeeId, from, to)) throw conflict('offsite_overlap', { field: 'fromDate' });
        const row = await tx.offsitePermission.create({
          data: { workspaceId: ws, employeeId: input.employeeId, fromDate: from, toDate: to, note: input.note?.trim() || null, grantedById: ctx.userId },
          include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } } },
        });
        await auditRepository.create(tx, {
          workspaceId: ws,
          actorUserId: ctx.userId,
          action: 'attendance.offsite_grant',
          entity: 'OffsitePermission',
          entityId: row.id,
          meta: { employeeId: input.employeeId, fromDate: input.fromDate, toDate: input.toDate, note: row.note },
          ip: meta.ip,
        });
        return (await offsiteView(tx, [row], today))[0]!;
      }),

    revokeOffsite: (ctx: AuthContext, id: string, meta: RequestMeta): Promise<OffsitePermission> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        const row = await repo.findOffsite(tx, ws, id);
        if (!row || !(await employeeAccess.canRead(tx, ctx, row.employeeId))) throw notFound();
        if (row.revokedAt) throw conflict('offsite_already_revoked');
        const now = new Date();
        const { today } = await clockOf(tx, ws, now);
        const updated = await tx.offsitePermission.update({ where: { id: row.id }, data: { revokedAt: now, revokedById: ctx.userId }, include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } } } });
        await auditRepository.create(tx, {
          workspaceId: ws,
          actorUserId: ctx.userId,
          action: 'attendance.offsite_revoke',
          entity: 'OffsitePermission',
          entityId: row.id,
          meta: { employeeId: row.employeeId },
          ip: meta.ip,
        });
        return (await offsiteView(tx, [updated], today))[0]!;
      }),

    // ───────────────────────── Devices (FR-ATT-11) ─────────────────────────

    /** HR view of an employee's bound phones and change requests. */
    employeeDevices: (ctx: AuthContext, employeeId: string): Promise<EmployeeDevices> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        const employee = await assertInScope(tx, ctx, employeeId);
        const user = await repo.userOfEmployee(tx, ws, employeeId);
        return {
          employee: { id: employee.id, employeeCode: employee.employeeCode, name: `${employee.firstName} ${employee.lastName}` },
          hasLogin: !!user,
          bindings: user ? (await repo.bindingsOf(tx, ws, user.id)).map(toBinding) : [],
          requests: await deviceRequestsView(tx, ws, employeeId),
        };
      }),

    /** Unbind a phone (HR reset): the employee binds a new one at their next sign-in. The row is kept, inactive. */
    resetBinding: (ctx: AuthContext, bindingId: string, meta: RequestMeta) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        const binding = await repo.findBinding(tx, ws, bindingId);
        const employeeId = binding?.user.employeeId;
        if (!binding || !employeeId || !(await employeeAccess.canRead(tx, ctx, employeeId))) throw notFound();
        if (!binding.isActive) throw conflict('device_binding_inactive');
        const updated = await tx.deviceBinding.update({ where: { id: binding.id }, data: { isActive: false, revokedAt: new Date(), revokedById: ctx.userId } });
        await auditRepository.create(tx, {
          workspaceId: ws,
          actorUserId: ctx.userId,
          action: 'attendance.device_reset',
          entity: 'DeviceBinding',
          entityId: binding.id,
          meta: { employeeId, userId: binding.userId, deviceId: binding.deviceId },
          ip: meta.ip,
        });
        return toBinding(updated);
      }),

    /** Employee asks HR to move their binding to this phone (FR-ATT-11.2); decided through DEVICE_CHANGE. */
    requestDeviceChange: (ctx: AuthContext, input: CreateDeviceChangeInput, meta: RequestMeta): Promise<DeviceChangeRequest> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        const employeeId = ownEmployeeId(ctx);
        if (await repo.pendingDeviceRequest(tx, ws, employeeId)) throw conflict('device_change_pending');
        const bindings = await repo.bindingsOf(tx, ws, ctx.userId);
        if (bindings.some((b) => b.isActive && b.deviceId === input.deviceId)) throw badRequest('device_already_bound');
        const row = await tx.deviceChangeRequest.create({
          data: { workspaceId: ws, employeeId, userId: ctx.userId, deviceId: input.deviceId, platform: input.platform, model: input.model || null, reason: input.reason },
        });
        const approval = await submitApproval(tx, registry, {
          workspaceId: ws,
          subjectType: 'DEVICE_CHANGE',
          subjectId: row.id,
          requesterEmployeeId: employeeId,
          submittedByUserId: ctx.userId,
          ip: meta.ip,
        });
        await auditRepository.create(tx, {
          workspaceId: ws,
          actorUserId: ctx.userId,
          action: 'attendance.device_change_request',
          entity: 'DeviceChangeRequest',
          entityId: row.id,
          meta: { deviceId: input.deviceId, platform: input.platform, model: row.model, approvalRequestId: approval.id },
          ip: meta.ip,
        });
        return toDeviceRequest(row, approval.id);
      }),

    myDeviceRequests: (ctx: AuthContext): Promise<DeviceChangeRequest[]> =>
      db.tenant(ctx.workspaceId, async (tx) => (ctx.employeeId ? deviceRequestsView(tx, ctx.workspaceId, ctx.employeeId) : [])),

    // ───────────────────────── Time corrections (FR-ATT-19) ─────────────────────────

    /**
     * File a correction of the caller's own work date (FR-ATT-19.1): records the counted IN/OUT it replaces and
     * submits ATTENDANCE_CORRECTION along the chain of command. Nothing changes until it is approved.
     */
    createCorrection: (ctx: AuthContext, input: CreateCorrectionInput, meta: RequestMeta): Promise<Correction> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        const employeeId = ownEmployeeId(ctx);
        const now = new Date();
        const { timeZone, today } = await clockOf(tx, ws, now);
        if (input.workDate > today) throw badRequest('correction_future_date', { field: 'workDate' });
        const workDate = parseIsoDate(input.workDate);
        if (input.attachmentFileId && !(await repo.ownAttachment(tx, ws, input.attachmentFileId, ctx.userId))) {
          throw badRequest('attachment_invalid', { field: 'attachmentFileId' });
        }
        if (await repo.pendingCorrection(tx, ws, employeeId, workDate)) throw conflict('correction_pending_exists', { field: 'workDate' });

        const counted = await repo.countedPunches(tx, ws, employeeId, workDate);
        const originalIn: AttendancePunch | undefined = counted.find((p) => p.kind === 'IN');
        const originalOut: AttendancePunch | undefined = counted.filter((p) => p.kind === 'OUT').at(-1);
        const checkIn = input.requestedCheckIn ? instantOn(input.workDate, input.requestedCheckIn, timeZone) : null;
        let checkOut = input.requestedCheckOut ? instantOn(input.workDate, input.requestedCheckOut, timeZone) : null;
        const reference = checkIn ?? originalIn?.capturedAt ?? null;
        if (checkOut && reference && checkOut <= reference) checkOut = instantOn(input.workDate, input.requestedCheckOut!, timeZone, 1);
        if ((checkIn && checkIn > now) || (checkOut && checkOut > now)) {
          throw badRequest('correction_time_in_future', { field: checkIn && checkIn > now ? 'requestedCheckIn' : 'requestedCheckOut' });
        }

        const row = await tx.attendanceCorrection.create({
          data: {
            workspaceId: ws,
            employeeId,
            workDate,
            originalInPunchId: checkIn ? (originalIn?.id ?? null) : null,
            originalOutPunchId: checkOut ? (originalOut?.id ?? null) : null,
            requestedCheckIn: checkIn,
            requestedCheckOut: checkOut,
            reason: input.reason,
            attachmentFileId: input.attachmentFileId ?? null,
            createdById: ctx.userId,
          },
          include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } } },
        });
        const approval = await submitApproval(tx, registry, {
          workspaceId: ws,
          subjectType: 'ATTENDANCE_CORRECTION',
          subjectId: row.id,
          requesterEmployeeId: employeeId,
          submittedByUserId: ctx.userId,
          ip: meta.ip,
          now,
        });
        await auditRepository.create(tx, {
          workspaceId: ws,
          actorUserId: ctx.userId,
          action: 'attendance.correction_request',
          entity: 'AttendanceCorrection',
          entityId: row.id,
          meta: {
            workDate: input.workDate,
            requestedCheckIn: checkIn ? localStamp(checkIn, timeZone) : null,
            requestedCheckOut: checkOut ? localStamp(checkOut, timeZone) : null,
            originalInPunchId: row.originalInPunchId,
            originalOutPunchId: row.originalOutPunchId,
            approvalRequestId: approval.id,
          },
          ip: meta.ip,
        });
        return (await correctionView(tx, ws, [row]))[0]!;
      }),

    myCorrections: (ctx: AuthContext): Promise<Correction[]> =>
      db.tenant(ctx.workspaceId, async (tx) => (ctx.employeeId ? correctionView(tx, ctx.workspaceId, await repo.correctionsOf(tx, ctx.workspaceId, ctx.employeeId)) : [])),
  };
};

export type AttendanceRequestsService = ReturnType<typeof createAttendanceRequestsService>;
