import {
  AttendanceMode,
  nextPunchKind,
  suspicionReasons,
  type CreateKioskInput,
  type KioskDevice,
  type KioskEnrolment,
  type KioskInfo,
  type KioskPunchBatchData,
  type KioskPunchBatchResponse,
  type KioskPunchItemResult,
  type PunchKind,
} from '@hrm/shared';
import type { AttendancePunch, KioskDevice as KioskRow } from '@prisma/client';
import type { Db, Tx } from '../../db/client';
import { isUniqueViolation } from '../../db/client';
import { randomToken, sha256 } from '../../lib/crypto';
import { parseIsoDate } from '../../lib/dates';
import { badRequest, conflict, notFound, unauthorized } from '../../lib/errors';
import { verifySecret } from '../../lib/password';
import { PUNCHING_STATUSES, reportSuspiciousPunches, toMyPunch } from '../attendance/checkin.service';
import { workspaceTimeZone } from '../attendance/day-context';
import { createPunches, workDateFor, type NewPunch } from '../attendance/punches';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { authRepository } from '../auth/auth.repository';
import { workspaceSuspended } from '../auth/auth.service';
import { kioskPhotoKeyPrefix, type FilesService, type UploadedFile } from '../files/files.service';
import { parameterReader } from '../parameters/parameters.service';

/** The enrolled kiosk behind a `Kiosk <token>` request. */
export interface KioskContext {
  kioskId: string;
  workspaceId: string;
  branchId: string;
  name: string;
}

/** Random bytes of an enrol code (base64url, ~43 characters). */
const ENROL_CODE_BYTES = 32;
/** `lastSeenAt` is written at most this often per kiosk (technical throttle, not a business rule). */
const LAST_SEEN_THROTTLE_MS = 60_000;

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

type KioskWithBranch = KioskRow & { branch: { name: string } };

const toKioskDevice = (k: KioskWithBranch, enrolledBy: Map<string, string>): KioskDevice => ({
  id: k.id,
  name: k.name,
  branchId: k.branchId,
  branchName: k.branch.name,
  enrolledByName: k.enrolledById ? (enrolledBy.get(k.enrolledById) ?? null) : null,
  lastSeenAt: iso(k.lastSeenAt),
  revokedAt: iso(k.revokedAt),
  createdAt: k.createdAt.toISOString(),
});

const enrolledByNames = async (tx: Tx, rows: readonly KioskRow[]) => {
  const ids = [...new Set(rows.flatMap((r) => (r.enrolledById ? [r.enrolledById] : [])))];
  const users = ids.length ? await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
  return new Map(users.map((u) => [u.id, u.displayName]));
};

const kioskModeOn = (branch: { attendanceModes: readonly string[]; isActive: boolean }) =>
  branch.isActive && branch.attendanceModes.includes(AttendanceMode.KIOSK);

interface ItemPlan {
  clientRef: string;
  punch?: NewPunch;
  result?: KioskPunchItemResult;
}

/**
 * Kiosk mode (FR-ATT-03.1–03.3, FR-WS-06.3). HR enrols a branch tablet and gets a one-time enrol code (only its
 * hash is stored); the tablet then calls the kiosk API with `Authorization: Kiosk <code>`. Employees punch with
 * their employee code + login PIN (same hash and lockout as the PIN sign-in) and a photo, always (03.3).
 */
export const createKioskService = (db: Db, files: () => FilesService) => {
  /** One pass over a kiosk batch inside one tenant transaction. */
  const submitOnce = (kiosk: KioskContext, body: KioskPunchBatchData, meta: { ip?: string }, now: Date) =>
    db.tenant(kiosk.workspaceId, async (tx): Promise<KioskPunchBatchResponse> => {
      const { workspaceId, kioskId } = kiosk;
      const refs = body.items.map((i) => i.clientRef);
      const stored = new Map((await tx.attendancePunch.findMany({ where: { workspaceId, clientRef: { in: refs } } })).map((p) => [p.clientRef!, p]));

      const branch = await tx.branch.findFirstOrThrow({ where: { id: kiosk.branchId, workspaceId } });
      const batchError = kioskModeOn(branch) ? null : 'attendance_mode_disabled';

      const codes = [...new Set(body.items.map((i) => i.employeeCode.toUpperCase()))];
      const employees = await tx.employee.findMany({
        where: {
          workspaceId,
          OR: [{ employeeCode: { in: codes, mode: 'insensitive' } }, { id: { in: [...stored.values()].map((p) => p.employeeId) } }],
        },
        select: {
          id: true, employeeCode: true, firstName: true, lastName: true, status: true, branchId: true,
          user: { select: { id: true, pinHash: true, isActive: true, lockedUntil: true, failedAttempts: true } },
        },
      });
      const byCode = new Map(employees.map((e) => [e.employeeCode.toUpperCase(), e]));
      const byId = new Map(employees.map((e) => [e.id, e]));
      const who = (employeeId: string) => {
        const e = byId.get(employeeId);
        return e ? { code: e.employeeCode, name: fullName(e) } : undefined;
      };

      const timeZone = await workspaceTimeZone(tx, workspaceId);
      const photoPrefix = kioskPhotoKeyPrefix(workspaceId, kioskId);
      /** Kind of the latest punch per employee+work date planned in this batch (for IN/OUT inference). */
      const planned = new Map<string, { at: number; kind: PunchKind }>();
      const plans: ItemPlan[] = [];
      const seen = new Set<string>();
      let lockout: { maxAttempts: number; lockMinutes: number } | null = null;

      for (const item of body.items) {
        const prior = stored.get(item.clientRef);
        if (prior) {
          // Offline replay (FR-ATT-05.2): the stored punch, for the kiosk that sent it.
          plans.push({
            clientRef: item.clientRef,
            result:
              prior.kioskDeviceId === kioskId
                ? { clientRef: item.clientRef, result: 'replayed', punch: toMyPunch(prior), employee: who(prior.employeeId) }
                : { clientRef: item.clientRef, result: 'rejected', error: 'conflict' },
          });
          continue;
        }
        if (seen.has(item.clientRef)) {
          plans.push({ clientRef: item.clientRef }); // repeat inside this batch: answered after the first is stored
          continue;
        }
        seen.add(item.clientRef);
        const reject = (error: string): ItemPlan => ({ clientRef: item.clientRef, result: { clientRef: item.clientRef, result: 'rejected', error } });
        if (batchError) {
          plans.push(reject(batchError));
          continue;
        }

        // Employee code + PIN (FR-ATT-03.2): the login PIN, with the sign-in lockout (auth.lockout.*).
        const employee = byCode.get(item.employeeCode.toUpperCase());
        const user = employee?.user;
        if (!employee || !user || !user.isActive || !user.pinHash) {
          await verifySecret(item.pin, null); // equalise timing; unknown code and wrong PIN answer alike
          plans.push(reject('kiosk_invalid_credentials'));
          continue;
        }
        if (user.lockedUntil && user.lockedUntil > now) {
          plans.push(reject('account_locked'));
          continue;
        }
        if (!(await verifySecret(item.pin, user.pinHash))) {
          lockout ??= {
            maxAttempts: await parameterReader.system(tx, 'auth.lockout.maxAttempts'),
            lockMinutes: await parameterReader.system(tx, 'auth.lockout.minutes'),
          };
          const nowLocked = await authRepository.recordFailedAttempt(tx, user.id, lockout.maxAttempts, lockout.lockMinutes);
          if (nowLocked) user.lockedUntil = new Date(now.getTime() + lockout.lockMinutes * 60_000);
          await auditRepository.create(tx, {
            workspaceId,
            actorUserId: null,
            action: nowLocked ? 'kiosk.pin_locked' : 'kiosk.pin_failed',
            entity: 'User',
            entityId: user.id,
            meta: { kioskId, employeeId: employee.id, clientRef: item.clientRef },
            ip: meta.ip,
          });
          plans.push(reject(nowLocked ? 'account_locked' : 'kiosk_invalid_credentials'));
          continue;
        }
        if (user.failedAttempts > 0) {
          await tx.user.update({ where: { id: user.id }, data: { failedAttempts: 0 } });
          user.failedAttempts = 0;
        }
        // Checked after the PIN so a guesser cannot tell which codes exist at other branches.
        if (employee.branchId !== kiosk.branchId) {
          plans.push(reject('kiosk_other_branch'));
          continue;
        }
        if (!PUNCHING_STATUSES.has(employee.status)) {
          plans.push(reject('attendance_employee_inactive'));
          continue;
        }
        // Photo at every kiosk punch (FR-ATT-03.3), regardless of attendance.selfieRequired.
        if (!item.selfieFileId) {
          plans.push(reject('attendance_selfie_required'));
          continue;
        }
        const photo = await tx.storedFile.findFirst({
          where: { id: item.selfieFileId, workspaceId, purpose: 'SELFIE', uploadedById: null, storageKey: { startsWith: photoPrefix } },
          select: { id: true },
        });
        if (!photo) {
          plans.push(reject('attendance_selfie_invalid'));
          continue;
        }

        const capturedAt = new Date(item.capturedAt);
        const workDate = await workDateFor(tx, workspaceId, employee.id, capturedAt, timeZone);
        const toleranceMinutes = await parameterReader.workspace(tx, workspaceId, 'attendance.deviceTimeToleranceMinutes', parseIsoDate(workDate));
        const kind = item.kind ?? (await inferKind(tx, workspaceId, employee.id, workDate, capturedAt, planned));
        const plannedKey = `${employee.id}|${workDate}`;
        if ((planned.get(plannedKey)?.at ?? -Infinity) <= capturedAt.getTime()) planned.set(plannedKey, { at: capturedAt.getTime(), kind });

        // Tablet clock skew (FR-ATT-07.2) → suspicious, reviewed by HR (FR-ATT-14).
        const reasons = suspicionReasons({ capturedAt, deviceSentAt: new Date(body.deviceSentAt), serverReceivedAt: now, toleranceMinutes });
        plans.push({
          clientRef: item.clientRef,
          punch: {
            employeeId: employee.id,
            kind,
            capturedAt,
            source: 'KIOSK',
            branchId: branch.id,
            // The tablet stands at the branch: no GPS check, the branch location is recorded.
            latitude: branch.latitude,
            longitude: branch.longitude,
            clientRef: item.clientRef,
            kioskDeviceId: kioskId,
            selfieFileId: photo.id,
            offline: item.offline,
            suspicious: reasons.length > 0,
            suspiciousReasons: reasons,
            reviewStatus: reasons.length > 0 ? 'PENDING' : 'NONE',
            workDate,
          },
        });
      }

      const toCreate = plans.flatMap((p) => (p.punch ? [p.punch] : []));
      const { created } = toCreate.length ? await createPunches(tx, workspaceId, toCreate, now) : { created: [] as AttendancePunch[] };
      const byRef = new Map(created.map((p) => [p.clientRef!, p]));
      await reportSuspiciousPunches(tx, {
        workspaceId,
        actorUserId: null,
        punches: created,
        employeeName: (id) => who(id)?.name ?? '',
        deviceSentAt: body.deviceSentAt,
        now,
        ip: meta.ip,
        meta: { kioskId },
      });

      const results = plans.map((plan): KioskPunchItemResult => {
        if (plan.result) return plan.result;
        const punch = byRef.get(plan.clientRef);
        if (!punch) return { clientRef: plan.clientRef, result: 'rejected', error: 'conflict' };
        return { clientRef: plan.clientRef, result: plan.punch ? 'created' : 'replayed', punch: toMyPunch(punch), employee: who(punch.employeeId) };
      });
      // A repeat whose first copy was rejected gets the same rejection.
      const firstRejection = new Map(results.filter((r) => r.result === 'rejected').map((r) => [r.clientRef, r]));
      return {
        serverTime: now.toISOString(),
        results: results.map((r, i) => (!plans[i]!.punch && !plans[i]!.result && firstRejection.get(r.clientRef)) || r),
      };
    });

  return {
    // ───────────── HR management (kiosk.manage) ─────────────

    /** Enrol a branch tablet; the enrol code is returned once and only its SHA-256 is stored. */
    async enrol(ctx: AuthContext, input: CreateKioskInput, meta: { ip?: string } = {}): Promise<KioskEnrolment> {
      return db.tenant(ctx.workspaceId, async (tx) => {
        const branch = await tx.branch.findFirst({ where: { id: input.branchId, workspaceId: ctx.workspaceId } });
        if (!branch) throw notFound();
        if (!kioskModeOn(branch)) throw badRequest('kiosk_mode_disabled');
        const enrolCode = randomToken(ENROL_CODE_BYTES);
        const kiosk = await tx.kioskDevice.create({
          data: { workspaceId: ctx.workspaceId, branchId: branch.id, name: input.name, tokenHash: sha256(enrolCode), enrolledById: ctx.userId },
          include: { branch: { select: { name: true } } },
        });
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: 'kiosk.enrolled',
          entity: 'KioskDevice',
          entityId: kiosk.id,
          meta: { branchId: branch.id, name: kiosk.name },
          ip: meta.ip,
        });
        return { kiosk: toKioskDevice(kiosk, await enrolledByNames(tx, [kiosk])), enrolCode };
      });
    },

    async list(ctx: AuthContext, query: { branchId?: string; includeRevoked?: boolean }): Promise<KioskDevice[]> {
      return db.tenant(ctx.workspaceId, async (tx) => {
        const rows = await tx.kioskDevice.findMany({
          where: { workspaceId: ctx.workspaceId, ...(query.branchId ? { branchId: query.branchId } : {}), ...(query.includeRevoked ? {} : { revokedAt: null }) },
          include: { branch: { select: { name: true } } },
          orderBy: [{ revokedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
        });
        const names = await enrolledByNames(tx, rows);
        return rows.map((r) => toKioskDevice(r, names));
      });
    },

    /** Revoke a kiosk: its token stops working at once. */
    async revoke(ctx: AuthContext, id: string, meta: { ip?: string } = {}, now: Date = new Date()): Promise<KioskDevice> {
      return db.tenant(ctx.workspaceId, async (tx) => {
        const kiosk = await tx.kioskDevice.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
        if (!kiosk) throw notFound();
        if (kiosk.revokedAt) throw conflict('kiosk_already_revoked');
        const updated = await tx.kioskDevice.update({ where: { id }, data: { revokedAt: now }, include: { branch: { select: { name: true } } } });
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: 'kiosk.revoked',
          entity: 'KioskDevice',
          entityId: id,
          meta: { branchId: kiosk.branchId, name: kiosk.name },
          ip: meta.ip,
        });
        return toKioskDevice(updated, await enrolledByNames(tx, [updated]));
      });
    },

    // ───────────── Kiosk device API (Authorization: Kiosk <token>) ─────────────

    /** Resolve the kiosk behind an enrol code: unknown → 401, revoked → 401, suspended workspace → 403. */
    async authenticate(token: string, now: Date = new Date()): Promise<KioskContext> {
      return db.system(async (tx) => {
        const kiosk = await tx.kioskDevice.findUnique({ where: { tokenHash: sha256(token) } });
        if (!kiosk) throw unauthorized('kiosk_not_enrolled');
        if (kiosk.revokedAt) throw unauthorized('kiosk_revoked');
        const ws = await tx.workspace.findUnique({ where: { id: kiosk.workspaceId }, select: { status: true } });
        if (!ws || ws.status === 'SUSPENDED') throw workspaceSuspended();
        if (!kiosk.lastSeenAt || now.getTime() - kiosk.lastSeenAt.getTime() >= LAST_SEEN_THROTTLE_MS) {
          await tx.kioskDevice.update({ where: { id: kiosk.id }, data: { lastSeenAt: now } });
        }
        return { kioskId: kiosk.id, workspaceId: kiosk.workspaceId, branchId: kiosk.branchId, name: kiosk.name };
      });
    },

    /** What the kiosk app shows: branch, company, time zone and the parameters it needs. */
    async info(kiosk: KioskContext, now: Date = new Date()): Promise<KioskInfo> {
      return db.tenant(kiosk.workspaceId, async (tx) => {
        const [branch, workspace, timeZone, tolerance, offlineAlertHours] = await Promise.all([
          tx.branch.findFirstOrThrow({ where: { id: kiosk.branchId, workspaceId: kiosk.workspaceId } }),
          tx.workspace.findUniqueOrThrow({ where: { id: kiosk.workspaceId }, select: { name: true } }),
          workspaceTimeZone(tx, kiosk.workspaceId),
          parameterReader.workspace(tx, kiosk.workspaceId, 'attendance.deviceTimeToleranceMinutes', now),
          parameterReader.workspace(tx, kiosk.workspaceId, 'attendance.offlineAlertHours', now),
        ]);
        return {
          id: kiosk.kioskId,
          name: kiosk.name,
          branch: { id: branch.id, name: branch.name },
          workspace: { name: workspace.name, logoUrl: null },
          timeZone,
          serverTime: now.toISOString(),
          photoRequired: true,
          kioskEnabled: kioskModeOn(branch),
          deviceTimeToleranceMinutes: tolerance,
          offlineAlertHours,
        };
      });
    },

    /** Punch photo from the kiosk camera (FR-ATT-03.3). */
    uploadPhoto: (kiosk: KioskContext, upload: UploadedFile) => files().uploadKioskPhoto(kiosk.workspaceId, kiosk.kioskId, upload),

    /**
     * Batch upload from the kiosk offline queue. Each item is created, replayed (same clientRef from this kiosk)
     * or rejected with an error code; one bad item never fails the batch.
     */
    async submitPunches(kiosk: KioskContext, body: KioskPunchBatchData, meta: { ip?: string } = {}, now: Date = new Date()): Promise<KioskPunchBatchResponse> {
      try {
        return await submitOnce(kiosk, body, meta, now);
      } catch (err) {
        // Two syncs of the same queue raced: the other one stored the refs, so this pass answers "replayed".
        if (isUniqueViolation(err)) return submitOnce(kiosk, body, meta, now);
        throw err;
      }
    },
  };
};

/**
 * Next punch kind for an employee at `capturedAt` (kiosk items without a kind): OUT after an IN on the same work
 * date — counting stored punches (not superseded / rejected) and earlier items of this batch — otherwise IN.
 */
const inferKind = async (
  tx: Tx,
  workspaceId: string,
  employeeId: string,
  workDate: string,
  capturedAt: Date,
  planned: ReadonlyMap<string, { at: number; kind: PunchKind }>,
): Promise<PunchKind> => {
  const last = await tx.attendancePunch.findFirst({
    where: { workspaceId, employeeId, workDate: parseIsoDate(workDate), capturedAt: { lte: capturedAt }, supersededAt: null, reviewStatus: { not: 'REJECTED' } },
    orderBy: { capturedAt: 'desc' },
    select: { kind: true, capturedAt: true },
  });
  const inBatch = planned.get(`${employeeId}|${workDate}`);
  const latest = inBatch && inBatch.at <= capturedAt.getTime() && (!last || inBatch.at >= last.capturedAt.getTime()) ? inBatch.kind : last?.kind;
  return nextPunchKind(latest);
};

export type KioskService = ReturnType<typeof createKioskService>;
