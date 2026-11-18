import type { Db } from '../../db/client';
import { todayInTimeZone, toIsoDate } from '../../lib/dates';
import { workspaceTimeZone } from '../../modules/attendance/day-context';
import { leaveRequestsRepository } from '../../modules/leave/leave-requests.repository';
import { notify } from '../../modules/notifications/notifications.service';

export interface LeaveCertificateDueResult {
  requests: number;
  notifications: number;
}

/**
 * Daily medical-certificate reminders (FR-LV-05.3, FR-NOTI-03): a pending or approved leave that needs a certificate
 * (stored `certificateDueDate`) and has none notifies the employee once when the leave has ended and the
 * certificate is due (stage `due`, grace period running) and once more when the deadline has passed (`overdue`).
 * The dedupe key `leave-cert:{requestId}:{stage}` makes re-runs harmless. An employee without an active login
 * (filed on their behalf, FR-LV-10) is reminded through whoever filed the request. The link opens the request.
 */
export const runLeaveCertificateDue = (db: Db, workspaceId: string, now: Date = new Date()): Promise<LeaveCertificateDueResult> =>
  db.tenant(workspaceId, async (tx) => {
    const today = todayInTimeZone(await workspaceTimeZone(tx, workspaceId), now);
    const rows = await leaveRequestsRepository.missingCertificates(tx, workspaceId, today);
    let notifications = 0;
    for (const r of rows) {
      const due = toIsoDate(r.certificateDueDate)!;
      const stage = today > due ? 'overdue' : 'due';
      const employeeUser = r.employee.user?.isActive ? r.employee.user.id : null;
      const recipient = employeeUser ?? r.submittedByUserId;
      if (!recipient) continue;
      const res = await notify(tx, {
        workspaceId,
        userIds: [recipient],
        type: 'LEAVE_CERTIFICATE_DUE',
        titleKey: 'notif.leaveCertificateDue.title',
        bodyKey: 'notif.leaveCertificateDue.body',
        params: { start: toIsoDate(r.startDate)!, end: toIsoDate(r.endDate)!, due },
        link: `/leave/${r.id}`,
        dedupeKey: `leave-cert:${r.id}:${stage}`,
        data: { leaveRequestId: r.id, certificateDueDate: due, stage },
      });
      notifications += res.created;
    }
    return { requests: rows.length, notifications };
  });
