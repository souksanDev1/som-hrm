import { ApprovalSubjectType, interpolate, translate, type ApprovalSummary } from '@hrm/shared';
import { approvalLink, type ApprovalSubjectHandler } from '../approvals/approval-handlers';

/**
 * DEVICE_CHANGE subject (FR-ATT-11.2/11.3): decided by HR, not the chain of command. Approval deactivates the
 * user's current binding (kept for the audit trail) and makes the requested phone the single active binding.
 */
export const deviceChangeApprovalHandler: ApprovalSubjectHandler = {
  subjectType: ApprovalSubjectType.DEVICE_CHANGE,
  routing: 'hr',

  async summarize(tx, workspaceId, subjectIds, locale) {
    const rows = await tx.deviceChangeRequest.findMany({ where: { workspaceId, id: { in: subjectIds } } });
    return new Map(
      rows.map((r): [string, ApprovalSummary] => [
        r.id,
        {
          title: interpolate(translate(locale, 'attreq.summary.device.title'), { device: r.model ?? r.deviceId }),
          detail: interpolate(translate(locale, 'attreq.summary.device.detail'), { platform: r.platform, reason: r.reason }),
        },
      ]),
    );
  },

  async onApproved(tx, { workspaceId, subjectId, actorUserId }) {
    const r = await tx.deviceChangeRequest.findFirst({ where: { id: subjectId, workspaceId, status: 'PENDING' } });
    if (!r) return;
    const now = new Date();
    // Deactivate first: at most one active binding per user (partial unique index).
    await tx.deviceBinding.updateMany({
      where: { workspaceId, userId: r.userId, isActive: true, deviceId: { not: r.deviceId } },
      data: { isActive: false, revokedAt: now, revokedById: actorUserId },
    });
    await tx.deviceBinding.upsert({
      where: { workspaceId_userId_deviceId: { workspaceId, userId: r.userId, deviceId: r.deviceId } },
      create: { workspaceId, userId: r.userId, deviceId: r.deviceId, platform: r.platform, model: r.model, isActive: true },
      update: { platform: r.platform, model: r.model, isActive: true, revokedAt: null, revokedById: null },
    });
    await tx.deviceChangeRequest.update({ where: { id: r.id }, data: { status: 'APPROVED', decidedAt: now } });
  },

  async onRejected(tx, { workspaceId, subjectId }) {
    await tx.deviceChangeRequest.updateMany({ where: { id: subjectId, workspaceId, status: 'PENDING' }, data: { status: 'REJECTED', decidedAt: new Date() } });
  },

  link: (request) => approvalLink(request.id),
};
