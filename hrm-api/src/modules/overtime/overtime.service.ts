import {
  ApprovalSubjectType,
  overtimePeriod,
  type MyOvertime,
  type OvertimeInput,
  type OvertimePreview,
  type OvertimePreviewInput,
  type OvertimeReport,
  type OvertimeReportQuery,
  type OvertimeRequestView,
  type OvertimeTotals,
  type Period,
} from '@hrm/shared';
import type { Db, Tx } from '../../db/client';
import { parseIsoDate } from '../../lib/dates';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { workspaceTimeZone } from '../attendance/day-context';
import type { ApprovalHandlerRegistry } from '../approvals/approval-handlers';
import { submitApproval } from '../approvals/approvals.service';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { employeeAccess } from '../employees/employees.service';
import { evaluateOvertime } from './overtime.calc';
import { overtimeRepository as repo, type OvertimeRow } from './overtime.repository';
import { toOvertimeView } from './overtime.view';

const emptyTotals = (): OvertimeTotals => ({ workdayDayMinutes: 0, workdayNightMinutes: 0, holidayDayMinutes: 0, holidayNightMinutes: 0, totalMinutes: 0 });
const addTo = (t: OvertimeTotals, r: OvertimeRow) => {
  t.workdayDayMinutes += r.workdayDayMinutes;
  t.workdayNightMinutes += r.workdayNightMinutes;
  t.holidayDayMinutes += r.holidayDayMinutes;
  t.holidayNightMinutes += r.holidayNightMinutes;
  t.totalMinutes += r.minutes;
};

const ownEmployee = async (tx: Tx, ctx: AuthContext): Promise<string> => {
  if (!ctx.employeeId || !(await tx.employee.findFirst({ where: { id: ctx.employeeId, workspaceId: ctx.workspaceId }, select: { id: true } }))) {
    throw notFound('no_employee_profile');
  }
  return ctx.employeeId;
};

/**
 * PRE = planned, so it must be filed before the OT starts; POST reports OT already done, so it must have ended
 * (conservative reading of FR-ATT-20.1/20.2).
 */
const periodOf = (input: OvertimePreviewInput, timeZone: string, now: Date): Period => {
  const period = overtimePeriod(input.workDate, input.start, input.end, timeZone);
  if (!period) throw badRequest('invalid_time');
  if (input.kind === 'PRE' && period.start.getTime() <= now.getTime()) throw badRequest('ot_pre_started');
  if (input.kind === 'POST' && period.end.getTime() > now.getTime()) throw badRequest('ot_post_in_future');
  return period;
};

const views = async (tx: Tx, workspaceId: string, rows: OvertimeRow[]) => {
  const [timeZone, approvals] = await Promise.all([workspaceTimeZone(tx, workspaceId), repo.approvalIds(tx, workspaceId, rows.map((r) => r.id))]);
  return rows.map((r) => toOvertimeView(r, timeZone, approvals.get(r.id) ?? null));
};

/** Overtime requests (FR-ATT-20..23): own preview/filing, own month, and the HR/manager monthly report. */
export const createOvertimeService = (db: Db, registry: ApprovalHandlerRegistry) => ({
  /** Split and cap status of a period before filing (FR-ATT-22.2); the same checks as filing except the cap block. */
  preview: (ctx: AuthContext, input: OvertimePreviewInput, now: Date = new Date()): Promise<OvertimePreview> =>
    db.tenant(ctx.workspaceId, async (tx) => {
      const employeeId = await ownEmployee(tx, ctx);
      const timeZone = await workspaceTimeZone(tx, ctx.workspaceId);
      const period = periodOf(input, timeZone, now);
      const e = await evaluateOvertime(tx, ctx.workspaceId, employeeId, input.workDate, period, timeZone);
      return { ...e, start: period.start.toISOString(), end: period.end.toISOString() };
    }),

  /**
   * File an OT request and start its approval (FR-ATT-20). Over the daily or monthly cap = 409 `ot_cap_exceeded`
   * (client decision: block). POST requests store the given times as the actual period.
   */
  create: (ctx: AuthContext, input: OvertimeInput, meta: { ip?: string } = {}, now: Date = new Date()): Promise<OvertimeRequestView> =>
    db.tenant(ctx.workspaceId, async (tx) => {
      const employeeId = await ownEmployee(tx, ctx);
      await repo.lockEmployee(tx, ctx.workspaceId, employeeId);
      const timeZone = await workspaceTimeZone(tx, ctx.workspaceId);
      const period = periodOf(input, timeZone, now);
      const e = await evaluateOvertime(tx, ctx.workspaceId, employeeId, input.workDate, period, timeZone);
      if (e.day.exceeded || e.month.exceeded) throw conflict('ot_cap_exceeded', { day: e.day, month: e.month });

      const row = await repo.create(tx, {
        workspaceId: ctx.workspaceId,
        employeeId,
        workDate: parseIsoDate(input.workDate),
        kind: input.kind,
        plannedStart: period.start,
        plannedEnd: period.end,
        ...(input.kind === 'POST' ? { actualStart: period.start, actualEnd: period.end } : {}),
        reason: input.reason,
        minutes: e.minutes,
        workdayDayMinutes: e.workdayDayMinutes,
        workdayNightMinutes: e.workdayNightMinutes,
        holidayDayMinutes: e.holidayDayMinutes,
        holidayNightMinutes: e.holidayNightMinutes,
        createdById: ctx.userId,
      });
      const approval = await submitApproval(tx, registry, {
        workspaceId: ctx.workspaceId,
        subjectType: ApprovalSubjectType.OVERTIME,
        subjectId: row.id,
        requesterEmployeeId: employeeId,
        submittedByUserId: ctx.userId,
        ip: meta.ip,
        now,
      });
      await auditRepository.create(tx, {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: 'overtime.requested',
        entity: 'OvertimeRequest',
        entityId: row.id,
        meta: { kind: input.kind, workDate: input.workDate, start: input.start, end: input.end, minutes: e.minutes, dayWarn: e.day.warn, monthWarn: e.month.warn },
        ip: meta.ip,
      });
      return toOvertimeView(row, timeZone, approval.id);
    }),

  /** The caller's own requests of a month with approved totals per category (FR-ATT-23). */
  mine: (ctx: AuthContext, month: string): Promise<MyOvertime> =>
    db.tenant(ctx.workspaceId, async (tx) => {
      const employeeId = await ownEmployee(tx, ctx);
      const rows = await repo.listMonth(tx, ctx.workspaceId, month, [employeeId]);
      const approved = emptyTotals();
      let pendingMinutes = 0;
      for (const r of rows) {
        if (r.status === 'APPROVED') addTo(approved, r);
        if (r.status === 'PENDING') pendingMinutes += r.minutes;
      }
      return { month, items: await views(tx, ctx.workspaceId, rows), approved, pendingMinutes };
    }),

  /**
   * Monthly OT report (payroll input, FR-ATT-21): approved minutes per employee and category, plus every request
   * of the month. Needs attendance.read_all (route); data scope: HR (employee.read_all) the workspace, managers their reporting tree.
   */
  report: (ctx: AuthContext, query: OvertimeReportQuery): Promise<OvertimeReport> =>
    db.tenant(ctx.workspaceId, async (tx) => {
      let ids = await employeeAccess.scope(tx, ctx);
      if (query.employeeId) {
        await employeeAccess.assertCanRead(tx, ctx, query.employeeId);
        ids = [query.employeeId];
      }
      const rows = await repo.listMonth(tx, ctx.workspaceId, query.month, ids);
      const byEmployee = new Map<string, OvertimeReport['rows'][number]>();
      const totals = emptyTotals();
      for (const r of rows) {
        if (r.status !== 'APPROVED') continue;
        let row = byEmployee.get(r.employeeId);
        if (!row) {
          row = { ...emptyTotals(), employeeId: r.employeeId, employeeCode: r.employee.employeeCode, employeeName: `${r.employee.firstName} ${r.employee.lastName}`, requests: 0 };
          byEmployee.set(r.employeeId, row);
        }
        addTo(row, r);
        row.requests++;
        addTo(totals, r);
      }
      const reportRows = [...byEmployee.values()].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
      return { month: query.month, rows: reportRows, totals, items: await views(tx, ctx.workspaceId, rows) };
    }),
});

export type OvertimeService = ReturnType<typeof createOvertimeService>;
