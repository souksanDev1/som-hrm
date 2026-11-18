import { ApprovalSubjectType, PERMISSIONS, roundLeaveDays, type LeaveCancelInput, type LeaveRequest } from '@hrm/shared';
import { Prisma } from '@prisma/client';
import type { Db, Tx } from '../../db/client';
import { toIsoDate } from '../../lib/dates';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import type { ApprovalHandlerRegistry } from '../approvals/approval-handlers';
import { submitApproval, withdrawApproval } from '../approvals/approvals.service';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { employeeAccess } from '../employees/employees.service';
import { parametersRepository } from '../parameters/parameters.repository';
import { cancelLeaveDelegation } from './leave-effects';

interface RequestMeta {
  ip?: string;
}

const leaveInclude = {
  employee: { select: { employeeCode: true, firstName: true, lastName: true } },
  leaveType: { select: { id: true, code: true, nameLo: true, nameEn: true } },
  cancelRequests: { orderBy: { createdAt: 'desc' }, take: 1 },
} as const satisfies Prisma.LeaveRequestInclude;

type LeaveRow = Prisma.LeaveRequestGetPayload<{ include: typeof leaveInclude }>;

const findLeave = (tx: Tx, workspaceId: string, id: string) => tx.leaveRequest.findFirst({ where: { workspaceId, id }, include: leaveInclude });

/**
 * Minimal `leaveRequestSchema` view returned by the cancel endpoint. The leave-filing module owns the full view;
 * `certificateRequired` is derived from the stored certificate fields here.
 */
const toView = async (tx: Tx, workspaceId: string, r: LeaveRow): Promise<LeaveRequest> => {
  const cancel = r.cancelRequests[0] ?? null;
  const approvals = await tx.approvalRequest.findMany({
    where: {
      workspaceId,
      OR: [{ subjectType: ApprovalSubjectType.LEAVE, subjectId: r.id }, ...(cancel ? [{ subjectType: ApprovalSubjectType.LEAVE_CANCEL, subjectId: cancel.id }] : [])],
    },
    select: { id: true, subjectType: true },
  });
  const approvalOf = (type: ApprovalSubjectType) => approvals.find((a) => a.subjectType === type)?.id ?? null;
  const submittedByName = r.submittedByUserId ? ((await parametersRepository.userNames(tx, [r.submittedByUserId])).get(r.submittedByUserId) ?? null) : null;
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeCode: r.employee.employeeCode,
    employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
    leaveType: r.leaveType,
    startDate: toIsoDate(r.startDate)!,
    endDate: toIsoDate(r.endDate)!,
    halfDay: r.halfDay,
    multipleBirth: r.multipleBirth,
    days: roundLeaveDays(Number(r.days)),
    reason: r.reason,
    status: r.status,
    filedAs: r.filedAs,
    submittedByName,
    certificateRequired: r.certificateDueDate !== null || r.certificateFileId !== null,
    certificateFileId: r.certificateFileId,
    certificateDueDate: toIsoDate(r.certificateDueDate),
    approvalRequestId: approvalOf(ApprovalSubjectType.LEAVE),
    cancelRequest: cancel ? { id: cancel.id, status: cancel.status, reason: cancel.reason, approvalRequestId: approvalOf(ApprovalSubjectType.LEAVE_CANCEL) } : null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
    createdAt: r.createdAt.toISOString(),
  };
};

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * Leave cancellation (FR-LV-12), allowed for the employee, whoever filed the leave, and HR (`leave.manage`):
 * - PENDING: withdrawn at once — the approval is withdrawn, the leave becomes CANCELLED and its absence delegation
 *   ends; nothing was posted to the ledger.
 * - APPROVED: a reason is required; a LeaveCancelRequest goes through approval (LEAVE_CANCEL) along the employee's
 *   chain, at most one pending at a time. The leave stays APPROVED until that is approved.
 * - Any other status: 409 `leave_not_cancellable`.
 */
export const createLeaveCancelService = (db: Db, registry: ApprovalHandlerRegistry) => ({
  cancel: (auth: AuthContext, id: string, input: LeaveCancelInput, meta: RequestMeta = {}): Promise<LeaveRequest> =>
    db.tenant(auth.workspaceId, async (tx) => {
      const ws = auth.workspaceId;
      const leave = await findLeave(tx, ws, id);
      if (!leave) throw notFound();
      const allowed = leave.employeeId === auth.employeeId || leave.submittedByUserId === auth.userId || auth.permissions.includes(PERMISSIONS.LEAVE_MANAGE);
      if (!allowed) {
        // Someone who may see the employee learns the leave exists but may not cancel it; anyone else gets 404.
        if (await employeeAccess.canRead(tx, auth, leave.employeeId)) throw forbidden('leave_cancel_not_allowed');
        throw notFound();
      }
      const reason = input.reason?.trim() || null;
      const now = new Date();

      if (leave.status === 'PENDING') {
        await withdrawApproval(tx, registry, { workspaceId: ws, subjectType: ApprovalSubjectType.LEAVE, subjectId: leave.id, actorUserId: auth.userId, note: reason, ip: meta.ip, now });
        const updated = await tx.leaveRequest.updateMany({ where: { id: leave.id, workspaceId: ws, status: 'PENDING' }, data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason } });
        if (updated.count !== 1) throw conflict('leave_not_cancellable');
        await cancelLeaveDelegation(tx, ws, leave, auth.userId);
        await auditRepository.create(tx, {
          workspaceId: ws,
          actorUserId: auth.userId,
          action: 'leave.cancel',
          entity: 'LeaveRequest',
          entityId: leave.id,
          meta: { from: 'PENDING', reason },
          ip: meta.ip,
        });
      } else if (leave.status === 'APPROVED') {
        if (!reason) throw badRequest('reason_required');
        if (await tx.leaveCancelRequest.findFirst({ where: { workspaceId: ws, leaveRequestId: leave.id, status: 'PENDING' }, select: { id: true } })) {
          throw conflict('leave_cancel_pending');
        }
        let cancelId: string;
        try {
          // The partial unique index rejects a concurrent second pending request (the transaction is then rolled back).
          cancelId = (await tx.leaveCancelRequest.create({ data: { workspaceId: ws, leaveRequestId: leave.id, reason, requestedByUserId: auth.userId } })).id;
        } catch (e) {
          if (isUniqueViolation(e)) throw conflict('leave_cancel_pending');
          throw e;
        }
        const approval = await submitApproval(tx, registry, {
          workspaceId: ws,
          subjectType: ApprovalSubjectType.LEAVE_CANCEL,
          subjectId: cancelId,
          requesterEmployeeId: leave.employeeId,
          submittedByUserId: auth.userId,
          ip: meta.ip,
          now,
        });
        await auditRepository.create(tx, {
          workspaceId: ws,
          actorUserId: auth.userId,
          action: 'leave.cancel_request',
          entity: 'LeaveRequest',
          entityId: leave.id,
          meta: { cancelRequestId: cancelId, approvalRequestId: approval.id, reason },
          ip: meta.ip,
        });
      } else {
        throw conflict('leave_not_cancellable');
      }
      return toView(tx, ws, (await findLeave(tx, ws, leave.id))!);
    }),
});

export type LeaveCancelService = ReturnType<typeof createLeaveCancelService>;
