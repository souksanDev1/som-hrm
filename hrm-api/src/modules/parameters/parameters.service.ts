import {
  PARAMETERS,
  type ParameterKey,
  type ParameterValue,
} from '@hrm/shared';
import type { Tx } from '../../db/client';

/**
 * Read side of the configurable-parameter store (FR-WS-08).
 *
 * Values are effective-dated: the row with the latest `effectiveFrom <= at` wins,
 * otherwise the registry default applies. Callers pass their own transaction so the
 * read is consistent with the business operation (and RLS applies for workspace rows).
 *
 * Write/admin APIs live in parameters.routes.ts (workspace) and the platform module (system).
 */
export const parameterReader = {
  /** Workspace-scoped value effective on `at` (a calendar date in the workspace's timezone). */
  async workspace<K extends ParameterKey>(tx: Tx, workspaceId: string, key: K, at: Date = new Date()): Promise<ParameterValue<K>> {
    assertScope(key, 'workspace');
    const row = await tx.workspaceParameter.findFirst({
      where: { workspaceId, key, effectiveFrom: { lte: at } },
      orderBy: { effectiveFrom: 'desc' },
    });
    return (row ? row.value : PARAMETERS[key].defaultValue) as ParameterValue<K>;
  },

  /** System-scoped value (SOM only) effective at instant `at`. Readable from any transaction. */
  async system<K extends ParameterKey>(tx: Tx, key: K, at: Date = new Date()): Promise<ParameterValue<K>> {
    assertScope(key, 'system');
    const row = await tx.systemParameter.findFirst({
      where: { key, effectiveFrom: { lte: at } },
      orderBy: { effectiveFrom: 'desc' },
    });
    return (row ? row.value : PARAMETERS[key].defaultValue) as ParameterValue<K>;
  },
};

const assertScope = (key: ParameterKey, scope: 'system' | 'workspace') => {
  if (PARAMETERS[key].scope !== scope) throw new Error(`Parameter ${key} is not ${scope}-scoped`);
};
