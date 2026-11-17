import type { Db } from '../../db/client';
import { settleOvertimeActuals } from '../../modules/overtime/overtime.actuals';

/**
 * Settle the actual period of approved planned OT once the day's punches are final (FR-ATT-21, see
 * `settleOvertimeActuals`). Idempotent: only requests without an actual period are considered.
 */
export const runOvertimeActuals = async (db: Db, workspaceId: string, now: Date = new Date()): Promise<{ settled: number }> => ({
  settled: await db.tenant(workspaceId, (tx) => settleOvertimeActuals(tx, workspaceId, now), { timeoutMs: 60_000 }),
});
