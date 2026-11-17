import {
  formatTimeOfDay,
  localDateTimeOf,
  type AttendanceEmployeeRef,
  type Correction,
  type DeviceBinding,
  type DeviceChangeRequest,
  type OffsitePermission,
  type ReviewPunch,
  type StoredFileRef,
} from '@hrm/shared';
import type { DeviceBinding as DeviceBindingRow, DeviceChangeRequest as DeviceChangeRow } from '@prisma/client';
import { toIsoDate } from '../../lib/dates';
import type { CorrectionRow, OffsiteRow, ReviewPunchRow } from './attendance-requests.repository';

/** "YYYY-MM-DD HH:mm" of an instant in the workspace time zone. */
export const localStamp = (instant: Date, timeZone: string): string => {
  const l = localDateTimeOf(instant, timeZone);
  return `${l.date} ${formatTimeOfDay(l.minuteOfDay)}`;
};

/** "HH:mm" of an instant on `workDate`, with "(+1)" when it falls on the next local day (night shift). */
export const localTimeOn = (instant: Date | null | undefined, workDate: string, timeZone: string): string | null => {
  if (!instant) return null;
  const l = localDateTimeOf(instant, timeZone);
  const time = formatTimeOfDay(l.minuteOfDay);
  return l.date === workDate ? time : l.date > workDate ? `${time} (+1)` : `${l.date} ${time}`;
};

export const toEmployeeRef = (e: { id: string; employeeCode: string; firstName: string; lastName: string }): AttendanceEmployeeRef => ({
  id: e.id,
  employeeCode: e.employeeCode,
  name: `${e.firstName} ${e.lastName}`,
});

export const toReviewPunch = (p: ReviewPunchRow, timeZone: string): ReviewPunch => ({
  id: p.id,
  employee: toEmployeeRef(p.employee),
  kind: p.kind,
  workDate: toIsoDate(p.workDate)!,
  capturedAt: p.capturedAt.toISOString(),
  capturedLocal: localStamp(p.capturedAt, timeZone),
  receivedAt: p.receivedAt.toISOString(),
  receivedLocal: localStamp(p.receivedAt, timeZone),
  source: p.source,
  branch: p.branch,
  latitude: p.latitude,
  longitude: p.longitude,
  accuracyMetres: p.accuracyMetres,
  distanceMetres: p.distanceMetres,
  selfieFileId: p.selfieFileId,
  offline: p.offline,
  suspicious: p.suspicious,
  suspiciousReasons: p.suspiciousReasons,
  reviewStatus: p.reviewStatus,
  reviewNote: p.reviewNote,
  reason: p.reason,
});

export const toOffsite = (p: OffsiteRow, today: string, grantedBy: string | null): OffsitePermission => ({
  id: p.id,
  employee: toEmployeeRef(p.employee),
  fromDate: toIsoDate(p.fromDate)!,
  toDate: toIsoDate(p.toDate)!,
  note: p.note,
  grantedBy,
  revokedAt: p.revokedAt?.toISOString() ?? null,
  active: !p.revokedAt && toIsoDate(p.toDate)! >= today,
  createdAt: p.createdAt.toISOString(),
});

export const toBinding = (b: DeviceBindingRow): DeviceBinding => ({
  id: b.id,
  deviceId: b.deviceId,
  platform: b.platform,
  model: b.model,
  isActive: b.isActive,
  lastSeenAt: b.lastSeenAt?.toISOString() ?? null,
  revokedAt: b.revokedAt?.toISOString() ?? null,
  createdAt: b.createdAt.toISOString(),
});

export const toDeviceRequest = (r: DeviceChangeRow, approvalRequestId: string | null): DeviceChangeRequest => ({
  id: r.id,
  deviceId: r.deviceId,
  platform: r.platform,
  model: r.model,
  reason: r.reason,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  decidedAt: r.decidedAt?.toISOString() ?? null,
  approvalRequestId,
});

export const toCorrection = (
  c: CorrectionRow,
  timeZone: string,
  originals: ReadonlyMap<string, Date>,
  attachment: StoredFileRef | null,
  approvalRequestId: string | null,
): Correction => {
  const workDate = toIsoDate(c.workDate)!;
  const original = (id: string | null) => (id && originals.has(id) ? localStamp(originals.get(id)!, timeZone) : null);
  const requested = (d: Date | null) => (d ? localStamp(d, timeZone) : null);
  return {
    id: c.id,
    employee: toEmployeeRef(c.employee),
    workDate,
    checkIn: { original: original(c.originalInPunchId), requested: requested(c.requestedCheckIn) },
    checkOut: { original: original(c.originalOutPunchId), requested: requested(c.requestedCheckOut) },
    reason: c.reason,
    attachment,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    decidedAt: c.decidedAt?.toISOString() ?? null,
    approvalRequestId,
  };
};
