import {
  countLeaveDays,
  leaveYearOf,
  roundLeaveDays,
  summarizeLedger,
  type HalfDay,
  type LeaveBalance,
  type LeaveCountingMethod,
  type LeaveLedgerKind,
} from '@hrm/shared';
import type { Tx } from '../../db/client';
import { parseIsoDate, toIsoDate } from '../../lib/dates';
import { loadLeaveDays } from './leave-days';

/**
 * Leave balance ledger (FR-LV-07, A14) — the only place that writes LeaveLedgerEntry. A balance is the sum of the
 * entries of one employee / type / leave year. Run every function inside the caller's tenant transaction.
 */

export interface LedgerPost {
  employeeId: string;
  leaveTypeId: string;
  periodYear: number;
  kind: LeaveLedgerKind;
  /** Signed days. */
  days: number;
  /** YYYY-MM-DD */
  effectiveDate: string;
  leaveRequestId?: string | null;
  reason?: string | null;
  /** Null = the system (jobs). */
  createdById?: string | null;
}

/** The request fields usage needs; `days` is the stored total. */
export interface LedgerRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  halfDay: HalfDay;
  days: unknown;
  leaveType: { countingMethod: LeaveCountingMethod };
}

/** Days of a request per leave year: the stored total when it stays within one year, else recounted by date. */
export const requestDaysByYear = async (tx: Tx, workspaceId: string, r: LedgerRequest): Promise<Record<number, number>> => {
  const start = toIsoDate(r.startDate)!;
  const end = toIsoDate(r.endDate)!;
  if (leaveYearOf(start) === leaveYearOf(end)) return { [leaveYearOf(start)]: roundLeaveDays(Number(r.days)) };
  const days = await loadLeaveDays(tx, workspaceId, r.employeeId, start, end);
  return countLeaveDays(days, r.leaveType.countingMethod, r.halfDay).byYear;
};

const requestSelect = {
  id: true,
  employeeId: true,
  leaveTypeId: true,
  startDate: true,
  endDate: true,
  halfDay: true,
  days: true,
  leaveType: { select: { countingMethod: true } },
} as const;

export const leaveLedger = {
  /** Append one movement. Periodic kinds (ENTITLEMENT/CARRY/EXPIRE) are unique per employee/type/year. */
  post: (tx: Tx, workspaceId: string, e: LedgerPost) =>
    tx.leaveLedgerEntry.create({
      data: {
        workspaceId,
        employeeId: e.employeeId,
        leaveTypeId: e.leaveTypeId,
        periodYear: e.periodYear,
        kind: e.kind,
        days: roundLeaveDays(e.days),
        effectiveDate: parseIsoDate(e.effectiveDate),
        leaveRequestId: e.leaveRequestId ?? null,
        reason: e.reason ?? null,
        createdById: e.createdById ?? null,
      },
    }),

  /**
   * Post the usage of an approved request (negative days per leave year). Idempotent: a second call for the same
   * request adds nothing (unique per request/year/kind).
   */
  postUsage: async (tx: Tx, workspaceId: string, leaveRequestId: string, actorUserId: string | null) => {
    const r = await tx.leaveRequest.findFirstOrThrow({ where: { workspaceId, id: leaveRequestId }, select: requestSelect });
    const byYear = await requestDaysByYear(tx, workspaceId, r);
    const start = toIsoDate(r.startDate)!;
    await tx.leaveLedgerEntry.createMany({
      skipDuplicates: true,
      data: Object.entries(byYear)
        .filter(([, days]) => days !== 0)
        .map(([year, days]) => ({
          workspaceId,
          employeeId: r.employeeId,
          leaveTypeId: r.leaveTypeId,
          periodYear: Number(year),
          kind: 'USAGE' as const,
          days: -days,
          effectiveDate: parseIsoDate(leaveYearOf(start) === Number(year) ? start : `${year}-01-01`),
          leaveRequestId: r.id,
          createdById: actorUserId,
        })),
    });
  },

  /** Give back what a request used (one CANCEL per USAGE row). Idempotent; nothing to do when it was never used. */
  postCancel: async (tx: Tx, workspaceId: string, leaveRequestId: string, effectiveDate: string, actorUserId: string | null, reason?: string | null) => {
    const usage = await tx.leaveLedgerEntry.findMany({ where: { workspaceId, leaveRequestId, kind: 'USAGE' } });
    if (!usage.length) return;
    await tx.leaveLedgerEntry.createMany({
      skipDuplicates: true,
      data: usage.map((u) => ({
        workspaceId,
        employeeId: u.employeeId,
        leaveTypeId: u.leaveTypeId,
        periodYear: u.periodYear,
        kind: 'CANCEL' as const,
        days: -Number(u.days),
        effectiveDate: parseIsoDate(effectiveDate),
        leaveRequestId,
        reason: reason ?? null,
        createdById: actorUserId,
      })),
    });
  },

  /** Sum of the entries per leave year (missing year = 0). */
  balanceByYear: async (tx: Tx, workspaceId: string, employeeId: string, leaveTypeId: string, years: number[]): Promise<Record<number, number>> => {
    const rows = await tx.leaveLedgerEntry.groupBy({
      by: ['periodYear'],
      where: { workspaceId, employeeId, leaveTypeId, periodYear: { in: years } },
      _sum: { days: true },
    });
    const out: Record<number, number> = Object.fromEntries(years.map((y) => [y, 0]));
    for (const r of rows) out[r.periodYear] = roundLeaveDays(Number(r._sum.days ?? 0));
    return out;
  },

  /** Days held by PENDING requests of the type per leave year (not in the ledger yet), optionally without one request. */
  pendingByYear: async (
    tx: Tx,
    workspaceId: string,
    employeeId: string,
    leaveTypeId: string,
    years: number[],
    excludeRequestId?: string,
  ): Promise<Record<number, number>> => {
    const out: Record<number, number> = Object.fromEntries(years.map((y) => [y, 0]));
    if (!years.length) return out;
    const from = parseIsoDate(`${Math.min(...years)}-01-01`);
    const to = parseIsoDate(`${Math.max(...years)}-12-31`);
    const pending = await tx.leaveRequest.findMany({
      where: { workspaceId, employeeId, leaveTypeId, status: 'PENDING', startDate: { lte: to }, endDate: { gte: from }, ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}) },
      select: requestSelect,
    });
    for (const r of pending) {
      for (const [year, days] of Object.entries(await requestDaysByYear(tx, workspaceId, r))) {
        if (Number(year) in out) out[Number(year)] = roundLeaveDays(out[Number(year)]! + days);
      }
    }
    return out;
  },

  /** Entries of one employee, newest first (FR-LV-07.3). */
  entries: (tx: Tx, workspaceId: string, employeeId: string, filter: { leaveTypeId?: string; year?: number } = {}) =>
    tx.leaveLedgerEntry.findMany({
      where: { workspaceId, employeeId, ...(filter.leaveTypeId ? { leaveTypeId: filter.leaveTypeId } : {}), ...(filter.year ? { periodYear: filter.year } : {}) },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    }),

  /** Balance of every active type for one employee and leave year, with pending days (FR-LV-06.2 display). */
  summaries: async (tx: Tx, workspaceId: string, employeeId: string, year: number): Promise<LeaveBalance[]> => {
    const [types, entries] = await Promise.all([
      tx.leaveType.findMany({ where: { workspaceId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }], select: { id: true, quotaPeriod: true } }),
      tx.leaveLedgerEntry.findMany({ where: { workspaceId, employeeId, periodYear: year }, select: { leaveTypeId: true, kind: true, days: true, periodYear: true } }),
    ]);
    const out: LeaveBalance[] = [];
    for (const t of types) {
      const summary = summarizeLedger(
        entries.filter((e) => e.leaveTypeId === t.id).map((e) => ({ kind: e.kind, days: Number(e.days), periodYear: e.periodYear })),
        year,
      );
      const pending = (await leaveLedger.pendingByYear(tx, workspaceId, employeeId, t.id, [year]))[year] ?? 0;
      out.push({ leaveTypeId: t.id, quotaPeriod: t.quotaPeriod, ...summary, pending });
    }
    return out;
  },
};
