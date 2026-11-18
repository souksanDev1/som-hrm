import {
  ApprovalSubjectType,
  AttendanceMode,
  checkPunchLocation,
  isWifiMismatch,
  nextPunchKind,
  PERMISSIONS,
  scheduledWindow,
  SuspicionReason,
  suspicionReasons,
  type CheckinStatus,
  type MyPunch,
  type MyPunchesQuery,
  type PunchBatchData,
  type PunchBatchResponse,
  type PunchItemResult,
} from '@hrm/shared';
import type { AttendancePunch } from '@prisma/client';
import type { Db, Tx } from '../../db/client';
import { isUniqueViolation } from '../../db/client';
import { parseIsoDate, toIsoDate } from '../../lib/dates';
import { badRequest, forbidden } from '../../lib/errors';
import type { ApprovalHandlerRegistry } from '../approvals/approval-handlers';
import { submitApproval } from '../approvals/approvals.service';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { notify } from '../notifications/notifications.service';
import { parameterReader } from '../parameters/parameters.service';
import { createDayContextMemo, loadEmployeeDays, workingShiftOf, workspaceTimeZone } from './day-context';
import { activeDeviceBinding, ensureDeviceBinding } from './device-binding';
import { createPunches, workDateFor, type NewPunch } from './punches';

const iso = (d: Date) => d.toISOString();

export const toMyPunch = (p: AttendancePunch): MyPunch => ({
  id: p.id,
  clientRef: p.clientRef,
  kind: p.kind,
  workDate: toIsoDate(p.workDate)!,
  capturedAt: iso(p.capturedAt),
  receivedAt: iso(p.receivedAt),
  source: p.source,
  offline: p.offline,
  offsite: p.offsite,
  offsiteReason: p.offsiteReason,
  distanceMetres: p.distanceMetres,
  accuracyMetres: p.accuracyMetres,
  suspicious: p.suspicious,
  suspiciousReasons: p.suspiciousReasons,
  reviewStatus: p.reviewStatus,
});

/** Employment statuses that may still punch. */
const PUNCHING_STATUSES = new Set(['PROBATION', 'ACTIVE', 'ON_LEAVE']);
/** Longest range `GET /attendance/punches/me` returns at once. */
const MY_PUNCHES_MAX_DAYS = 62;

const requireEmployee = (ctx: AuthContext): string => {
  if (!ctx.employeeId) throw forbidden('attendance_no_employee');
  return ctx.employeeId;
};

const loadEmployee = (tx: Tx, workspaceId: string, employeeId: string) =>
  tx.employee.findFirstOrThrow({
    where: { id: employeeId, workspaceId },
    select: { id: true, firstName: true, lastName: true, status: true, branch: true },
  });

/** Active off-site permission covering `workDate` (FR-ATT-16.1). */
const offsitePermissionOn = (tx: Tx, workspaceId: string, employeeId: string, workDate: string) =>
  tx.offsitePermission.findFirst({
    where: { workspaceId, employeeId, revokedAt: null, fromDate: { lte: parseIsoDate(workDate) }, toDate: { gte: parseIsoDate(workDate) } },
    orderBy: { createdAt: 'desc' },
  });

/** Users who work the suspicious-attendance queue (FR-ATT-14, FR-NOTI-03.6). */
const reviewerUserIds = async (tx: Tx, workspaceId: string) =>
  (
    await tx.user.findMany({
      where: { workspaceId, isActive: true, roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.ATTENDANCE_REVIEW } } } } } } },
      select: { id: true },
    })
  ).map((u) => u.id);

interface ItemPlan {
  clientRef: string;
  punch?: NewPunch;
  result?: PunchItemResult;
  /** Wi-Fi reported at capture, kept in the audit trail of a suspicious punch. */
  wifi?: PunchBatchData['items'][number]['wifi'];
}

export const createCheckinService = (db: Db, registry: ApprovalHandlerRegistry) => {
  /** One pass over a batch inside one tenant transaction. */
  const submitOnce = (ctx: AuthContext, employeeId: string, body: PunchBatchData, meta: { ip?: string }, now: Date) =>
    db.tenant(ctx.workspaceId, async (tx): Promise<PunchBatchResponse> => {
      const { workspaceId } = ctx;
      const refs = body.items.map((i) => i.clientRef);
      const stored = new Map((await tx.attendancePunch.findMany({ where: { workspaceId, clientRef: { in: refs } } })).map((p) => [p.clientRef!, p]));

      // Batch-level checks (same answer for every new item): employment, branch mode, device binding.
      const employee = await loadEmployee(tx, workspaceId, employeeId);
      const branch = employee.branch;
      let batchError: string | null = null;
      if (!PUNCHING_STATUSES.has(employee.status)) batchError = 'attendance_employee_inactive';
      else if (!branch || !branch.attendanceModes.includes(AttendanceMode.MOBILE)) batchError = 'attendance_mode_disabled';
      else {
        const binding = await ensureDeviceBinding(tx, workspaceId, ctx.userId, body, { ip: meta.ip, now });
        if (!binding.ok) batchError = 'device_not_bound';
      }

      // Work dates are assigned here and the days recomputed by createPunches from the same reads.
      const memo = createDayContextMemo(tx, workspaceId);
      const timeZone = await memo.timeZone();
      const plans: ItemPlan[] = [];
      const seen = new Set<string>();
      for (const item of body.items) {
        const prior = stored.get(item.clientRef);
        if (prior) {
          // Offline replay (FR-ATT-05.2): answer with what was stored, whatever changed since.
          plans.push({
            clientRef: item.clientRef,
            result:
              prior.employeeId === employeeId
                ? { clientRef: item.clientRef, result: 'replayed', punch: toMyPunch(prior) }
                : { clientRef: item.clientRef, result: 'rejected', error: 'conflict' },
          });
          continue;
        }
        if (seen.has(item.clientRef)) {
          plans.push({ clientRef: item.clientRef }); // repeat inside this batch: answered after the first is stored
          continue;
        }
        seen.add(item.clientRef);
        const reject = (error: string, extra: Partial<PunchItemResult> = {}): ItemPlan => ({
          clientRef: item.clientRef,
          result: { clientRef: item.clientRef, result: 'rejected', error, ...extra },
        });
        if (batchError) {
          plans.push(reject(batchError));
          continue;
        }
        if (item.mocked) {
          // Fake GPS (FR-ATT-09.2, NFR-06): refused and kept in the audit trail.
          await auditRepository.create(tx, {
            workspaceId,
            actorUserId: ctx.userId,
            action: 'attendance.mock_location',
            entity: 'Employee',
            entityId: employeeId,
            meta: { clientRef: item.clientRef, kind: item.kind, capturedAt: item.capturedAt, latitude: item.latitude, longitude: item.longitude, deviceId: body.deviceId },
            ip: meta.ip,
          });
          plans.push(reject('attendance_mock_location'));
          continue;
        }

        const capturedAt = new Date(item.capturedAt);
        const workDate = await workDateFor(tx, workspaceId, employeeId, capturedAt, timeZone, memo);
        const paramDate = parseIsoDate(workDate);
        const [params, permission] = await Promise.all([
          parameterReader.workspaceMany(
            tx,
            workspaceId,
            ['attendance.maxAccuracyMetres', 'attendance.selfieRequired', 'attendance.deviceTimeToleranceMinutes'],
            paramDate,
          ),
          offsitePermissionOn(tx, workspaceId, employeeId, workDate),
        ]);
        const {
          'attendance.maxAccuracyMetres': maxAccuracyMetres,
          'attendance.selfieRequired': selfieRequired,
          'attendance.deviceTimeToleranceMinutes': toleranceMinutes,
        } = params;
        const point = item.latitude !== null && item.longitude !== null ? { latitude: item.latitude, longitude: item.longitude } : null;
        const location = checkPunchLocation({ point, accuracyMetres: item.accuracyMetres, maxAccuracyMetres }, branch!, !!permission);
        if (!location.ok) {
          plans.push(reject(location.error, location.distanceMetres !== null ? { distanceMetres: location.distanceMetres } : {}));
          continue;
        }
        const offsiteReason = item.offsiteReason?.trim() || null;
        if (location.outsideZone && !offsiteReason) {
          plans.push(reject('attendance_offsite_reason_required', location.distanceMetres !== null ? { distanceMetres: location.distanceMetres } : {}));
          continue;
        }
        if (item.selfieFileId) {
          const selfie = await tx.storedFile.findFirst({ where: { id: item.selfieFileId, workspaceId, purpose: 'SELFIE', uploadedById: ctx.userId } });
          if (!selfie) {
            plans.push(reject('attendance_selfie_invalid'));
            continue;
          }
        } else if (selfieRequired) {
          plans.push(reject('attendance_selfie_required'));
          continue;
        }

        const reasons = suspicionReasons({
          capturedAt,
          deviceSentAt: new Date(body.deviceSentAt),
          serverReceivedAt: now,
          toleranceMinutes,
          rooted: body.rooted,
          // Office Wi-Fi (FR-ATT-12): only for punches inside the geofence; off-site punches have their own approval.
          wifiMismatch: !location.outsideZone && isWifiMismatch(branch!.wifiNetworks, item.wifi),
        });
        const suspicious = reasons.length > 0;
        plans.push({
          clientRef: item.clientRef,
          wifi: item.wifi,
          punch: {
            employeeId,
            kind: item.kind,
            capturedAt,
            source: 'MOBILE',
            branchId: branch!.id,
            latitude: item.latitude,
            longitude: item.longitude,
            accuracyMetres: item.accuracyMetres,
            distanceMetres: location.distanceMetres,
            clientRef: item.clientRef,
            deviceId: body.deviceId,
            selfieFileId: item.selfieFileId ?? null,
            offline: item.offline,
            offsite: location.outsideZone,
            offsiteReason: location.outsideZone ? offsiteReason : null,
            suspicious,
            suspiciousReasons: reasons,
            reviewStatus: suspicious || location.outsideZone ? 'PENDING' : 'NONE',
            workDate,
          },
        });
      }

      const toCreate = plans.flatMap((p) => (p.punch ? [p.punch] : []));
      const { created } = toCreate.length ? await createPunches(tx, workspaceId, toCreate, now, memo) : { created: [] };
      const byRef = new Map(created.map((p) => [p.clientRef!, p]));

      const reviewers = created.some((p) => p.suspicious) ? await reviewerUserIds(tx, workspaceId) : [];
      const wifiByRef = new Map(plans.flatMap((p) => (p.punch ? [[p.clientRef, p.wifi] as const] : [])));
      for (const p of created) {
        if (p.offsite) {
          await submitApproval(tx, registry, {
            workspaceId,
            subjectType: ApprovalSubjectType.OFFSITE_CHECKIN,
            subjectId: p.id,
            requesterEmployeeId: employeeId,
            submittedByUserId: ctx.userId,
            ip: meta.ip,
            now,
          });
        }
        if (p.suspicious) {
          await auditRepository.create(tx, {
            workspaceId,
            actorUserId: ctx.userId,
            action: 'attendance.suspicious_punch',
            entity: 'AttendancePunch',
            entityId: p.id,
            meta: {
              reasons: p.suspiciousReasons,
              deviceSentAt: body.deviceSentAt,
              receivedAt: iso(now),
              ...(body.rooted ? { rooted: true } : {}),
              ...(p.suspiciousReasons.includes(SuspicionReason.WIFI_MISMATCH) ? { wifi: wifiByRef.get(p.clientRef!) ?? null } : {}),
            },
            ip: meta.ip,
          });
          await notify(tx, {
            workspaceId,
            userIds: reviewers.filter((id) => id !== ctx.userId),
            type: 'SUSPICIOUS_ATTENDANCE',
            titleKey: 'notif.suspicious.title',
            bodyKey: 'notif.suspicious.body',
            params: {
              employee: `${employee.firstName} ${employee.lastName}`,
              reason: { t: `attendance.suspicion.${p.suspiciousReasons[0]}` },
              date: toIsoDate(p.workDate)!,
            },
            link: '/attendance/review',
            dedupeKey: `suspicious-punch:${p.id}`,
            data: { punchId: p.id, employeeId },
          });
        }
      }

      const results = plans.map((plan): PunchItemResult => {
        if (plan.result) return plan.result;
        const punch = byRef.get(plan.clientRef);
        if (!punch) return { clientRef: plan.clientRef, result: 'rejected', error: 'conflict' };
        return { clientRef: plan.clientRef, result: plan.punch ? 'created' : 'replayed', punch: toMyPunch(punch) };
      });
      // A repeat whose first copy was rejected gets the same rejection.
      const firstRejection = new Map(results.filter((r) => r.result === 'rejected').map((r) => [r.clientRef, r]));
      return {
        serverTime: iso(now),
        results: results.map((r, i) => (!plans[i]!.punch && !plans[i]!.result && firstRejection.get(r.clientRef)) || r),
      };
    });

  return {
    /**
     * Batch upload from the mobile offline queue (FR-ATT-01/05–09/15/16.2). Each item is created, replayed
     * (idempotent clientRef) or rejected with an error code; one bad item never fails the batch.
     */
    async submitPunches(ctx: AuthContext, body: PunchBatchData, meta: { ip?: string } = {}, now: Date = new Date()): Promise<PunchBatchResponse> {
      const employeeId = requireEmployee(ctx);
      try {
        return await submitOnce(ctx, employeeId, body, meta, now);
      } catch (err) {
        // Two syncs of the same queue raced: the other one stored the refs, so this pass answers "replayed".
        if (isUniqueViolation(err)) return submitOnce(ctx, employeeId, body, meta, now);
        throw err;
      }
    },

    /** Today's check-in context for the signed-in employee (FR-ATT-01, 08, 15, 16). */
    async status(ctx: AuthContext, now: Date = new Date()): Promise<CheckinStatus> {
      const employeeId = requireEmployee(ctx);
      return db.tenant(ctx.workspaceId, async (tx) => {
        const { workspaceId } = ctx;
        const timeZone = await workspaceTimeZone(tx, workspaceId);
        const workDate = await workDateFor(tx, workspaceId, employeeId, now, timeZone);
        const at = parseIsoDate(workDate);
        const [employee, days, binding, permission, todayPunches, lastPunch, day, selfieRequired, maxAccuracyMetres, offlineAlertHours, tolerance] =
          await Promise.all([
            loadEmployee(tx, workspaceId, employeeId),
            loadEmployeeDays(tx, workspaceId, employeeId, [workDate]),
            activeDeviceBinding(tx, workspaceId, ctx.userId),
            offsitePermissionOn(tx, workspaceId, employeeId, workDate),
            tx.attendancePunch.findMany({
              where: { workspaceId, employeeId, workDate: at, supersededAt: null, reviewStatus: { not: 'REJECTED' } },
              orderBy: { capturedAt: 'desc' },
              take: 1,
            }),
            tx.attendancePunch.findFirst({ where: { workspaceId, employeeId }, orderBy: { capturedAt: 'desc' } }),
            tx.attendanceDay.findFirst({ where: { workspaceId, employeeId, workDate: at } }),
            parameterReader.workspace(tx, workspaceId, 'attendance.selfieRequired', at),
            parameterReader.workspace(tx, workspaceId, 'attendance.maxAccuracyMetres', at),
            parameterReader.workspace(tx, workspaceId, 'attendance.offlineAlertHours', at),
            parameterReader.workspace(tx, workspaceId, 'attendance.deviceTimeToleranceMinutes', at),
          ]);
        const today = days.get(workDate);
        const shift = workingShiftOf(today);
        const shiftName = today?.shift ? ((await tx.shift.findFirst({ where: { id: today.shift.id, workspaceId }, select: { name: true } }))?.name ?? null) : null;
        const window = shift ? scheduledWindow(workDate, shift, today!.scheduledMinutes, timeZone) : null;
        const branch = employee.branch;
        return {
          serverTime: iso(now),
          workDate,
          timeZone,
          shift: shift && window ? { name: shiftName, startTime: shift.startTime, endTime: shift.endTime, scheduledStart: iso(window.start), scheduledEnd: iso(window.end) } : null,
          branch: branch
            ? {
                id: branch.id,
                name: branch.name,
                latitude: branch.latitude,
                longitude: branch.longitude,
                geofenceRadius: branch.geofenceRadius,
                attendanceModes: branch.attendanceModes,
              }
            : null,
          mobileEnabled: !!branch && branch.attendanceModes.includes(AttendanceMode.MOBILE) && PUNCHING_STATUSES.has(employee.status),
          selfieRequired,
          maxAccuracyMetres,
          offlineAlertHours,
          deviceTimeToleranceMinutes: tolerance,
          device: binding ? { deviceId: binding.deviceId, platform: binding.platform, model: binding.model } : null,
          offsitePermission: permission
            ? { id: permission.id, fromDate: toIsoDate(permission.fromDate)!, toDate: toIsoDate(permission.toDate)!, note: permission.note }
            : null,
          lastPunch: lastPunch ? toMyPunch(lastPunch) : null,
          nextKind: nextPunchKind(todayPunches[0]?.kind),
          day: day
            ? {
                status: day.status,
                firstInAt: day.firstInAt ? iso(day.firstInAt) : null,
                lastOutAt: day.lastOutAt ? iso(day.lastOutAt) : null,
                lateMinutes: day.lateMinutes,
                earlyLeaveMinutes: day.earlyLeaveMinutes,
                workedMinutes: day.workedMinutes,
              }
            : null,
        };
      });
    },

    /** The caller's own punches by work date, newest first (FR-ATT-06: offline flag + received time). */
    async myPunches(ctx: AuthContext, query: MyPunchesQuery): Promise<MyPunch[]> {
      const employeeId = requireEmployee(ctx);
      const from = parseIsoDate(query.from);
      const to = parseIsoDate(query.to);
      if ((to.getTime() - from.getTime()) / 86_400_000 >= MY_PUNCHES_MAX_DAYS) throw badRequest('range_too_long');
      const rows = await db.tenant(ctx.workspaceId, (tx) =>
        tx.attendancePunch.findMany({ where: { workspaceId: ctx.workspaceId, employeeId, workDate: { gte: from, lte: to } }, orderBy: { capturedAt: 'desc' } }),
      );
      return rows.map(toMyPunch);
    },
  };
};

export type CheckinService = ReturnType<typeof createCheckinService>;

