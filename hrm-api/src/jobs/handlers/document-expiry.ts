import { documentExpiry, PERMISSIONS } from '@hrm/shared';
import type { Db } from '../../db/client';
import { DEFAULT_TIME_ZONE, parseIsoDate, todayInTimeZone, toIsoDate } from '../../lib/dates';
import { notify } from '../../modules/notifications/notifications.service';
import { parameterReader } from '../../modules/parameters/parameters.service';

export interface DocumentExpiryRunResult {
  documents: number;
  notifications: number;
}

const ENDED_STATUSES = ['RESIGNED', 'TERMINATED'] as const;

/**
 * Daily document-expiry alerts for one workspace (FR-EMP-05.1/05.2/05.3).
 *
 * Thresholds come from the workspace parameter `document.expiryAlertDays` (default 90/60/30/7) and
 * "today" from the workspace timezone. A document notifies HR (users holding employee.write) and the
 * employee's own login once per stage: the smallest threshold it falls within, or "expired". The
 * dedupe key `doc-expiry:{docId}:{stage}` makes re-runs and overlapping schedules harmless.
 */
export const runDocumentExpiryAlerts = (db: Db, workspaceId: string, now: Date = new Date()): Promise<DocumentExpiryRunResult> =>
  db.tenant(workspaceId, async (tx) => {
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
    if (!workspace) return { documents: 0, notifications: 0 };
    const today = todayInTimeZone(workspace.timezone || DEFAULT_TIME_ZONE, now);
    const thresholds = await parameterReader.workspace(tx, workspaceId, 'document.expiryAlertDays', parseIsoDate(today));
    const horizon = new Date(parseIsoDate(today).getTime() + Math.max(...thresholds) * 86_400_000);

    const documents = await tx.employeeDocument.findMany({
      where: { workspaceId, expiresAt: { not: null, lte: horizon }, employee: { status: { notIn: [...ENDED_STATUSES] } } },
      select: {
        id: true,
        type: true,
        expiresAt: true,
        employee: { select: { id: true, firstName: true, lastName: true, user: { select: { id: true, isActive: true } } } },
      },
    });
    if (documents.length === 0) return { documents: 0, notifications: 0 };

    const hrUsers = await tx.user.findMany({
      where: {
        workspaceId,
        isActive: true,
        roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.EMPLOYEE_WRITE } } } } } },
      },
      select: { id: true },
    });
    const hrUserIds = hrUsers.map((u) => u.id);

    let notifications = 0;
    let alerted = 0;
    for (const doc of documents) {
      const expiresAt = toIsoDate(doc.expiresAt)!;
      const expiry = documentExpiry(expiresAt, today, thresholds);
      if (expiry.status !== 'EXPIRED' && expiry.status !== 'EXPIRING') continue;
      alerted++;
      const expired = expiry.status === 'EXPIRED';
      const message = {
        workspaceId,
        type: 'DOCUMENT_EXPIRY' as const,
        titleKey: expired ? 'notif.docExpired.title' : 'notif.docExpiring.title',
        bodyKey: expired ? 'notif.docExpired.body' : 'notif.docExpiring.body',
        params: {
          document: { t: `document.${doc.type}` },
          employee: `${doc.employee.firstName} ${doc.employee.lastName}`,
          days: expiry.daysUntilExpiry ?? 0,
          date: expiresAt,
        },
        dedupeKey: `doc-expiry:${doc.id}:${expired ? 'expired' : expiry.thresholdDays}`,
        data: { documentId: doc.id, employeeId: doc.employee.id },
      };
      const hr = await notify(tx, { ...message, userIds: hrUserIds, link: `/employees/${doc.employee.id}` });
      const own = doc.employee.user?.isActive && !hrUserIds.includes(doc.employee.user.id)
        ? await notify(tx, { ...message, userIds: [doc.employee.user.id], link: '/profile' })
        : { created: 0 };
      notifications += hr.created + own.created;
    }
    return { documents: alerted, notifications };
  });
