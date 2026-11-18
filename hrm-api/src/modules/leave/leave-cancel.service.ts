import { ApprovalSubjectType, PERMISSIONS, type LeaveCancelInput, type LeaveRequest } from '@hrm/shared';
import { Prisma } from '@prisma/client';
import type { Db } from '../../db/client';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import type { ApprovalHandlerRegistry } from '../approvals/approval-handlers';
import { submitApproval, withdrawApproval } from '../approvals/approvals.service';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { employeeAccess } from '../employees/employees.service';
import { cancelLeaveDelegation } from './leave-effects';
import { leaveRequestsRepository } from './leave-requests.repository';
import { buildLeaveRequestViews } from './leave-requests.view';

interface RequestMeta {
  ip?: string;
}

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
      const leave = await leaveRequestsRepository.findById(tx, ws, id);
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
      return (await buildLeaveRequestViews(tx, ws, [(await leaveRequestsRepository.findById(tx, ws, leave.id))!]))[0]!;
    }),
});

export type LeaveCancelService = ReturnType<typeof createLeaveCancelService>;
