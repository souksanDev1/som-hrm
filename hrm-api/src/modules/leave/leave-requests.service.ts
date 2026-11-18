import {
  addDays,
  ApprovalSubjectType,
  certificateRequired,
  checkLeaveEligibility,
  countLeaveDays,
  LeaveQuotaPeriod,
  nthWorkingDayAfter,
  PERMISSIONS,
  quotaDays,
  roundLeaveDays,
  validateLeaveRange,
  type LeaveFiledAs,
  type LeavePreview,
  type LeavePreviewInput,
  type LeaveRequest,
  type LeaveRequestInput,
  type LeaveRequestListQuery,
} from '@hrm/shared';
import type { Db, Tx } from '../../db/client';
import { parseIsoDate, todayInTimeZone } from '../../lib/dates';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { workspaceTimeZone } from '../attendance/day-context';
import type { ApprovalHandlerRegistry } from '../approvals/approval-handlers';
import { submitApproval } from '../approvals/approvals.service';
import { ensureDelegationForAbsence } from '../approvals/delegations.service';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { employeeAccess } from '../employees/employees.service';
import { employeesRepository } from '../employees/employees.repository';
import { parameterReader } from '../parameters/parameters.service';
import { loadLeaveDays, loadLeaveEmployee } from './leave-days';
import { leaveLedger } from './leave-ledger';
import { leaveRequestsRepository as repo, type LeaveRequestRow } from './leave-requests.repository';
import { leaveTypesRepository, toPolicyRule, toTypeRule } from './leave-types.repository';
import { buildLeaveRequestViews } from './leave-requests.view';

interface RequestMeta {
  ip?: string;
}

/** Who the request is for and in which capacity the caller files it (FR-LV-10). */
interface Target {
  employeeId: string;
  filedAs: LeaveFiledAs;
}

/**
 * Calendar days scanned after the end date to find the certificate deadline (`leave.certificateGraceDays` working
 * days later, Q12): a week per working day plus a margin for holiday runs (e.g. Lao New Year).
 */
const certificateWindowDays = (graceDays: number) => graceDays * 7 + 14;

/**
 * Resolve the employee a request is for: oneself; anyone with `leave.file_on_behalf` (HR); or, for a manager,
 * someone below them in the reporting line. Anyone else gets 403.
 */
const resolveTarget = async (tx: Tx, ctx: AuthContext, employeeId: string | undefined): Promise<Target> => {
  if (!employeeId || employeeId === ctx.employeeId) {
    if (!ctx.employeeId || !(await tx.employee.findFirst({ where: { id: ctx.employeeId, workspaceId: ctx.workspaceId }, select: { id: true } }))) {
      throw notFound('no_employee_profile');
    }
    return { employeeId: ctx.employeeId, filedAs: 'SELF' };
  }
  if (ctx.permissions.includes(PERMISSIONS.LEAVE_FILE_ON_BEHALF)) {
    if (!(await tx.employee.findFirst({ where: { id: employeeId, workspaceId: ctx.workspaceId }, select: { id: true } }))) throw notFound('employee_not_found');
    return { employeeId, filedAs: 'HR' };
  }
  if (ctx.employeeId && (await employeesRepository.reportingTreeIds(tx, ctx.workspaceId, ctx.employeeId)).includes(employeeId)) {
    return { employeeId, filedAs: 'MANAGER' };
  }
  throw forbidden();
};

interface Evaluation {
  preview: LeavePreview;
  /** Today in the workspace time zone. */
  today: string;
}

/**
 * Counting, balance and eligibility of a request for one employee (FR-LV-03/04/05/06, FR-ORG-03.2) — the single
 * source for the preview and the filing checks. Range errors short-circuit (nothing to count).
 */
const evaluate = async (tx: Tx, ctx: AuthContext, employeeId: string, input: LeavePreviewInput): Promise<Evaluation> => {
  const ws = ctx.workspaceId;
  const today = todayInTimeZone(await workspaceTimeZone(tx, ws));
  const row = await leaveTypesRepository.get(tx, ws, input.leaveTypeId);
  if (!row.isActive) throw badRequest('leave_type_inactive', { field: 'leaveTypeId' });
  const type = toTypeRule(row);
  const policy = toPolicyRule(row);
  const empty: LeavePreview = { days: 0, byYear: {}, balanceByYear: null, quota: null, errors: [], certificateRequired: false, certificateDueDate: null, needsDelegate: false };

  const rangeError = validateLeaveRange({ startDate: input.startDate, endDate: input.endDate, halfDay: input.halfDay, allowHalfDay: type.allowHalfDay });
  if (rangeError) return { today, preview: { ...empty, errors: [rangeError] } };

  const [days, employee] = await Promise.all([
    loadLeaveDays(tx, ws, employeeId, input.startDate, input.endDate),
    loadLeaveEmployee(tx, ws, employeeId),
  ]);
  const count = countLeaveDays(days, type.countingMethod, input.halfDay);
  const years = Object.keys(count.byYear).map(Number);

  let balanceByYear: Record<number, number> | null = null;
  if (type.quotaPeriod === LeaveQuotaPeriod.YEARLY) {
    // Available = ledger balance minus days held by the employee's other PENDING requests of the year.
    const [ledger, pending] = await Promise.all([
      leaveLedger.balanceByYear(tx, ws, employeeId, row.id, years),
      leaveLedger.pendingByYear(tx, ws, employeeId, row.id, years),
    ]);
    balanceByYear = Object.fromEntries(years.map((y) => [y, roundLeaveDays((ledger[y] ?? 0) - (pending[y] ?? 0))]));
  }
  const quota = type.quotaPeriod === LeaveQuotaPeriod.PER_EVENT ? quotaDays(type, policy, employee, { multipleBirth: input.multipleBirth }) : null;
  const errors: string[] = checkLeaveEligibility({
    type,
    policy,
    employee,
    startDate: input.startDate,
    count,
    balanceByYear: balanceByYear ?? undefined,
    multipleBirth: input.multipleBirth,
  });
  if (await repo.findOverlapping(tx, ws, employeeId, input.startDate, input.endDate)) errors.push('leave_overlaps_request');

  const at = parseIsoDate(today);
  const [threshold, grace] = await Promise.all([
    parameterReader.workspace(tx, ws, 'leave.certificateThresholdDays', at),
    parameterReader.workspace(tx, ws, 'leave.certificateGraceDays', at),
  ]);
  const needsCertificate = certificateRequired(type, count.days, threshold);
  let certificateDueDate: string | null = null;
  if (needsCertificate) {
    const windowEnd = addDays(input.endDate, certificateWindowDays(grace));
    const after = await loadLeaveDays(tx, ws, employeeId, addDays(input.endDate, 1), windowEnd);
    certificateDueDate = nthWorkingDayAfter(input.endDate, grace, after) ?? windowEnd;
  }

  // FR-ORG-03.2: an employee with direct reports needs a delegate unless one already covers the period.
  // Leave entirely in the past needs none (nothing left to approve on their behalf).
  const needsDelegate =
    input.endDate >= today &&
    (await ensureDelegationForAbsence(tx, ws, ctx.userId, { startDate: input.startDate, endDate: input.endDate, managerEmployeeId: employeeId })).needsDelegate;

  return {
    today,
    preview: {
      days: count.days,
      byYear: Object.fromEntries(Object.entries(count.byYear)),
      balanceByYear: balanceByYear && Object.fromEntries(Object.entries(balanceByYear)),
      quota,
      errors,
      certificateRequired: needsCertificate,
      certificateDueDate,
      needsDelegate,
    },
  };
};

const views = buildLeaveRequestViews;

/** Read access to one request: the employee, whoever filed it, HR, anyone with the employee in data scope, approvers. */
const canRead = async (tx: Tx, ctx: AuthContext, r: LeaveRequestRow): Promise<boolean> =>
  r.employeeId === ctx.employeeId ||
  r.submittedByUserId === ctx.userId ||
  ctx.permissions.includes(PERMISSIONS.LEAVE_MANAGE) ||
  (await employeeAccess.canRead(tx, ctx, r.employeeId)) ||
  (await repo.isApprover(tx, ctx.workspaceId, r.id, ctx.userId));

/** Change access (certificate): the employee, whoever filed it, or HR (`leave.manage`). */
const canChange = (ctx: AuthContext, r: LeaveRequestRow) =>
  r.employeeId === ctx.employeeId || r.submittedByUserId === ctx.userId || ctx.permissions.includes(PERMISSIONS.LEAVE_MANAGE);

/**
 * Leave requests (FR-LV-03/05/06/09/10, FR-ORG-03.2): preview, filing (own or on behalf), lists, detail and late
 * certificate attach. Decisions and cancellation live in the approval handler / cancel service.
 */
export const createLeaveRequestsService = (db: Db, registry: ApprovalHandlerRegistry) => ({
  /** Days, balance, eligibility, certificate and delegate needs before filing — nothing is saved. */
  preview: (ctx: AuthContext, input: LeavePreviewInput): Promise<LeavePreview> =>
    db.tenant(ctx.workspaceId, async (tx) => {
      const target = await resolveTarget(tx, ctx, input.employeeId);
      return (await evaluate(tx, ctx, target.employeeId, input)).preview;
    }),

  /**
   * File a request and start its approval. Runs the same checks as the preview (400 with the first `leave_*` code
   * and every error in `details.errors`); the certificate is mandatory now only when its deadline has already
   * passed, otherwise it can be attached later. Requesters with direct reports must name a delegate.
   */
  create: (ctx: AuthContext, input: LeaveRequestInput, meta: RequestMeta = {}): Promise<LeaveRequest> =>
    db.tenant(ctx.workspaceId, async (tx) => {
      const ws = ctx.workspaceId;
      const target = await resolveTarget(tx, ctx, input.employeeId);
      await repo.lockEmployee(tx, ws, target.employeeId);
      const { preview, today } = await evaluate(tx, ctx, target.employeeId, input);
      if (preview.errors.length) throw badRequest(preview.errors[0]!, { errors: preview.errors, preview });

      if (input.certificateFileId && !(await repo.ownAttachment(tx, ws, input.certificateFileId, ctx.userId))) {
        throw badRequest('leave_certificate_invalid', { field: 'certificateFileId' });
      }
      if (preview.certificateRequired && !input.certificateFileId && preview.certificateDueDate! < today) {
        throw badRequest('leave_certificate_required', { field: 'certificateFileId', certificateDueDate: preview.certificateDueDate });
      }

      let delegationId: string | null = null;
      if (input.endDate >= today) {
        const absence = await ensureDelegationForAbsence(
          tx,
          ws,
          ctx.userId,
          { startDate: input.startDate, endDate: input.endDate, delegateUserId: input.delegateUserId, managerEmployeeId: target.employeeId },
          meta,
        );
        if (absence.needsDelegate) throw badRequest('delegate_required', { field: 'delegateUserId' });
        delegationId = absence.delegation?.id ?? null;
      }

      const row = await repo.create(tx, {
        workspaceId: ws,
        employeeId: target.employeeId,
        leaveTypeId: input.leaveTypeId,
        startDate: parseIsoDate(input.startDate),
        endDate: parseIsoDate(input.endDate),
        halfDay: input.halfDay,
        multipleBirth: input.multipleBirth,
        days: preview.days,
        reason: input.reason || null,
        certificateFileId: input.certificateFileId ?? null,
        certificateDueDate: preview.certificateDueDate ? parseIsoDate(preview.certificateDueDate) : null,
        submittedByUserId: ctx.userId,
        filedAs: target.filedAs,
        delegationId,
      });
      await submitApproval(tx, registry, {
        workspaceId: ws,
        subjectType: ApprovalSubjectType.LEAVE,
        subjectId: row.id,
        requesterEmployeeId: target.employeeId,
        submittedByUserId: ctx.userId,
        ip: meta.ip,
      });
      await auditRepository.create(tx, {
        workspaceId: ws,
        actorUserId: ctx.userId,
        action: 'leave.requested',
        entity: 'LeaveRequest',
        entityId: row.id,
        meta: {
          employeeId: target.employeeId,
          filedAs: target.filedAs,
          leaveTypeId: input.leaveTypeId,
          startDate: input.startDate,
          endDate: input.endDate,
          halfDay: input.halfDay,
          days: preview.days,
          certificateDueDate: preview.certificateDueDate,
          certificateFileId: input.certificateFileId ?? null,
          delegationId,
        },
        ip: meta.ip,
      });
      return (await views(tx, ws, [row]))[0]!;
    }),

  /** Own requests (`mine`) or every request in the caller's data scope (`team`), newest first. */
  list: (ctx: AuthContext, query: LeaveRequestListQuery): Promise<LeaveRequest[]> =>
    db.tenant(ctx.workspaceId, async (tx) => {
      let employeeIds: string[] | null;
      if (query.scope === 'mine') {
        if (!ctx.employeeId) throw notFound('no_employee_profile');
        employeeIds = [ctx.employeeId];
      } else {
        employeeIds = await employeeAccess.scope(tx, ctx);
      }
      const rows = await repo.list(tx, ctx.workspaceId, { employeeIds, status: query.status, year: query.year });
      return views(tx, ctx.workspaceId, rows);
    }),

  get: (ctx: AuthContext, id: string): Promise<LeaveRequest> =>
    db.tenant(ctx.workspaceId, async (tx) => {
      const row = await repo.findById(tx, ctx.workspaceId, id);
      if (!row || !(await canRead(tx, ctx, row))) throw notFound();
      return (await views(tx, ctx.workspaceId, [row]))[0]!;
    }),

  /** Attach (or replace) the medical certificate after filing (FR-LV-05.3); the file must be the caller's own upload. */
  attachCertificate: (ctx: AuthContext, id: string, fileId: string, meta: RequestMeta = {}): Promise<LeaveRequest> =>
    db.tenant(ctx.workspaceId, async (tx) => {
      const ws = ctx.workspaceId;
      const before = await repo.findById(tx, ws, id);
      if (!before || !(await canRead(tx, ctx, before))) throw notFound();
      if (!canChange(ctx, before)) throw forbidden();
      if (before.status === 'REJECTED' || before.status === 'CANCELLED') throw conflict('leave_request_closed');
      if (!(await repo.ownAttachment(tx, ws, fileId, ctx.userId))) throw badRequest('leave_certificate_invalid', { field: 'fileId' });
      const row = await repo.update(tx, before.id, { certificateFileId: fileId });
      await auditRepository.create(tx, {
        workspaceId: ws,
        actorUserId: ctx.userId,
        action: 'leave.certificate.attached',
        entity: 'LeaveRequest',
        entityId: row.id,
        meta: { old: before.certificateFileId, new: fileId },
        ip: meta.ip,
      });
      return (await views(tx, ws, [row]))[0]!;
    }),
});

export type LeaveRequestsService = ReturnType<typeof createLeaveRequestsService>;
