import { localDateTimeOf, workDateOf, type AttendanceSource, type PunchKind, type PunchReviewStatus } from '@hrm/shared';
import type { AttendancePunch } from '@prisma/client';
import type { Tx } from '../../db/client';
import { parseIsoDate } from '../../lib/dates';
import { recomputeAttendanceDays } from './attendance-days';
import { candidateDates, loadEmployeeDays, workingShiftOf, workspaceTimeZone } from './day-context';

/** One punch to store, from any source (mobile, kiosk, scanner, HR on behalf, correction). */
export interface NewPunch {
  employeeId: string;
  kind: PunchKind;
  capturedAt: Date;
  source: AttendanceSource;
  branchId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMetres?: number | null;
  distanceMetres?: number | null;
  /** Device idempotency key: a replayed key returns the stored punch instead of a new one (FR-ATT-05.2). */
  clientRef?: string | null;
  deviceId?: string | null;
  kioskDeviceId?: string | null;
  selfieFileId?: string | null;
  offline?: boolean;
  offsite?: boolean;
  offsiteReason?: string | null;
  suspicious?: boolean;
  suspiciousReasons?: string[];
  reviewStatus?: PunchReviewStatus;
  createdById?: string | null;
  reason?: string | null;
  scanImportId?: string | null;
  /** Explicit work date (YYYY-MM-DD) — corrections name the day they fix; otherwise derived with `workDateOf`. */
  workDate?: string;
}

export interface CreatePunchesResult {
  /** Newly stored punches, in input order. */
  created: AttendancePunch[];
  /** One entry per input whose `clientRef` was already stored (offline replay), as stored. A repeat of a ref first seen in this same batch is dropped. */
  replayed: AttendancePunch[];
  /** Work dates recomputed, by employee. */
  recomputed: Map<string, string[]>;
}

/**
 * Store punches and recompute the affected `AttendanceDay` rows — the single write path for every punch source,
 * so work-date assignment (night shifts, A12), idempotency and recalculation never diverge. Source-specific checks
 * (geofence, device binding, suspicion, permissions) happen in the caller before this.
 */
export const createPunches = async (tx: Tx, workspaceId: string, punches: readonly NewPunch[], now: Date = new Date()): Promise<CreatePunchesResult> => {
  const refs = punches.flatMap((p) => (p.clientRef ? [p.clientRef] : []));
  const existing = refs.length
    ? new Map((await tx.attendancePunch.findMany({ where: { workspaceId, clientRef: { in: refs } } })).map((p) => [p.clientRef!, p]))
    : new Map<string, AttendancePunch>();

  const timeZone = await workspaceTimeZone(tx, workspaceId);
  const created: AttendancePunch[] = [];
  const replayed: AttendancePunch[] = [];
  const touched = new Map<string, Set<string>>();
  const seenRefs = new Set<string>();

  for (const p of punches) {
    const prior = p.clientRef ? existing.get(p.clientRef) : undefined;
    if (prior || (p.clientRef && seenRefs.has(p.clientRef))) {
      if (prior) replayed.push(prior);
      continue;
    }
    if (p.clientRef) seenRefs.add(p.clientRef);

    const workDate = p.workDate ?? (await workDateFor(tx, workspaceId, p.employeeId, p.capturedAt, timeZone));
    const { workDate: _ignored, ...data } = p;
    created.push(await tx.attendancePunch.create({ data: { ...data, workspaceId, workDate: parseIsoDate(workDate), receivedAt: now } }));
    touched.set(p.employeeId, (touched.get(p.employeeId) ?? new Set()).add(workDate));
  }

  const recomputed = new Map<string, string[]>();
  for (const [employeeId, dates] of touched) {
    await recomputeAttendanceDays(tx, workspaceId, employeeId, [...dates], now);
    recomputed.set(employeeId, [...dates].sort());
  }
  return { created, replayed, recomputed };
};

/** Work date of a punch at `instant` for an employee: a night shift's early-morning punches go to its start day. */
export const workDateFor = async (tx: Tx, workspaceId: string, employeeId: string, instant: Date, timeZone?: string): Promise<string> => {
  const tz = timeZone ?? (await workspaceTimeZone(tx, workspaceId));
  const days = await loadEmployeeDays(tx, workspaceId, employeeId, candidateDates(localDateTimeOf(instant, tz).date));
  return workDateOf(instant, tz, (date) => workingShiftOf(days.get(date)));
};
