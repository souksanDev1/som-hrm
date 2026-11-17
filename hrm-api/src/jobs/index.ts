import type { Db } from '../db/client';
import type { SmsSender } from '../lib/sms';
import type { PushSender } from '../modules/notifications/push';
import { runAccountDeactivation } from './handlers/account-deactivation';
import { runApprovalEscalation } from './handlers/approval-escalation';
import { runDocumentExpiryAlerts } from './handlers/document-expiry';
import { runHolidayDefaults } from './handlers/holiday-defaults';
import { deliverPendingNotifications } from './handlers/notification-delivery';
import { runProbationEndingAlerts } from './handlers/probation-ending';
import { runOvertimeActuals } from './handlers/overtime-actuals';
import type { JobRunner } from './runner';

export { runAccountDeactivation, runApprovalEscalation, runDocumentExpiryAlerts, deliverPendingNotifications, runHolidayDefaults, runProbationEndingAlerts };
export { runOvertimeActuals };

/** Payload of every tenant-scoped job: handlers run inside `db.tenant(workspaceId)`. */
export interface WorkspaceJob {
  workspaceId: string;
}

export const JOBS = {
  notificationDelivery: 'notification-delivery',
  documentExpiry: 'document-expiry-alerts',
  probationEnding: 'probation-ending-alerts',
  accountDeactivation: 'account-deactivation',
  holidayDefaults: 'holiday-defaults',
  approvalEscalation: 'approval-escalation',
  overtimeActuals: 'overtime-actuals',
} as const;

/** Workspaces that should receive scheduled work (suspended companies are skipped). */
export const listActiveWorkspaceIds = async (db: Db): Promise<string[]> =>
  (await db.system((tx) => tx.workspace.findMany({ where: { status: 'ACTIVE' }, select: { id: true }, orderBy: { createdAt: 'asc' } }))).map(
    (w) => w.id,
  );

/**
 * Fan one scheduled tick out to a per-workspace job for each ACTIVE workspace. The singleton key
 * (queue policy `stately`) keeps at most one queued job per workspace, so overlapping ticks are no-ops.
 */
export const fanOutToWorkspaces = async (db: Db, runner: Pick<JobRunner, 'send'>, job: string): Promise<number> => {
  const ids = await listActiveWorkspaceIds(db);
  for (const workspaceId of ids) {
    await runner.send(job, { workspaceId } satisfies WorkspaceJob, { singletonKey: workspaceId });
  }
  return ids.length;
};

export interface WorkerDeps {
  db: Db;
  runner: JobRunner;
  push: PushSender;
  sms: SmsSender;
  deliveryMaxAttempts: number;
  log: (msg: string, meta?: object) => void;
}

const tick = (name: string) => `${name}.tick`;

/** Register every handler and cron schedule (times are Asia/Vientiane). */
export const registerJobs = async ({ db, runner, push, sms, deliveryMaxAttempts, log }: WorkerDeps): Promise<void> => {
  const perWorkspace = async (name: string, cron: string, handler: (workspaceId: string) => Promise<object>) => {
    await runner.register<WorkspaceJob>(name, async ({ workspaceId }) => {
      const result = await handler(workspaceId);
      log(`job ${name} done`, { workspaceId, ...result });
    });
    await runner.register(tick(name), async () => {
      await fanOutToWorkspaces(db, runner, name);
    });
    await runner.schedule(tick(name), cron);
  };

  await perWorkspace(JOBS.notificationDelivery, '* * * * *', (ws) =>
    deliverPendingNotifications({ db, push, sms, maxAttempts: deliveryMaxAttempts }, ws),
  );
  await perWorkspace(JOBS.documentExpiry, '0 7 * * *', (ws) => runDocumentExpiryAlerts(db, ws));
  await perWorkspace(JOBS.probationEnding, '5 7 * * *', (ws) => runProbationEndingAlerts(db, ws));
  await perWorkspace(JOBS.accountDeactivation, '30 0 * * *', (ws) => runAccountDeactivation(db, ws));
  // 1st of every month: current year's statutory holidays, plus next year's from December (FR-WS-04.1).
  await perWorkspace(JOBS.holidayDefaults, '15 1 1 * *', (ws) => runHolidayDefaults(db, ws));
  // Before the working day starts: steps left undecided for N full working days move up (FR-ORG-05).
  await perWorkspace(JOBS.approvalEscalation, '0 6 * * *', (ws) => runApprovalEscalation(db, ws));
  // Hourly: approved planned OT gets its actual period from final punches (FR-ATT-21).
  await perWorkspace(JOBS.overtimeActuals, '25 * * * *', (ws) => runOvertimeActuals(db, ws));
};
