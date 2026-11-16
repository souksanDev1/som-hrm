import {
  isoDateInTimeZone,
  isParameterKey,
  PARAMETERS,
  parameterKeysByScope,
  validateParameterValue,
  type ParameterDef,
  type ParameterKey,
  type ParameterList,
  type ParameterValueInput,
  type ParameterView,
  type SetSystemParameterInput,
  type SetWorkspaceParameterInput,
} from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import type { Db } from '../../db/client';
import { parseIsoDate, toIsoDate } from '../../lib/dates';
import { badRequest, conflict, forbidden } from '../../lib/errors';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { platformAuditRepository, platformUserRepository } from '../platform/platform.repository';
import { parametersRepository } from './parameters.repository';
import { parameterReader } from './parameters.service';

/** A system change may be sent as "now"; tolerate this much clock skew / latency. */
const SYSTEM_PAST_TOLERANCE_MS = 60_000;

interface StoredRow {
  id: string;
  key: string;
  value: Prisma.JsonValue;
  effectiveFrom: Date;
  reason: string | null;
  createdById: string | null;
  createdAt: Date;
}

interface RequestMeta {
  ip?: string;
}

const plain = (v: ParameterDef['defaultValue']): ParameterValueInput => (Array.isArray(v) ? [...v] : (v as number | boolean));

/** Build the settings-screen view of one key from its stored rows (ascending by effectiveFrom). */
const buildView = (
  key: ParameterKey,
  rows: StoredRow[],
  at: Date,
  formatDate: (d: Date) => string,
  names: Map<string, string>,
): ParameterView => {
  const def: ParameterDef = PARAMETERS[key];
  const own = rows.filter((r) => r.key === key);
  const past = own.filter((r) => r.effectiveFrom <= at);
  const current = past.at(-1);
  const toChange = (r: StoredRow) => ({
    id: r.id,
    value: r.value as ParameterValueInput,
    effectiveFrom: formatDate(r.effectiveFrom),
    reason: r.reason,
    createdByName: r.createdById ? (names.get(r.createdById) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
  });
  return {
    key,
    labelKey: def.labelKey,
    type: def.type,
    unit: def.type === 'boolean' ? null : (def.unit ?? null),
    min: def.type === 'boolean' ? null : def.min,
    max: def.type === 'boolean' ? null : def.max,
    legalMin: def.type === 'int' ? (def.legalMin ?? null) : null,
    legalMax: def.type === 'int' ? (def.legalMax ?? null) : null,
    maxItems: def.type === 'intList' ? def.maxItems : null,
    defaultValue: plain(def.defaultValue),
    currentValue: current ? (current.value as ParameterValueInput) : plain(def.defaultValue),
    source: current ? 'configured' : 'default',
    scheduled: own.filter((r) => r.effectiveFrom > at).map(toChange),
    history: past.reverse().map(toChange),
  };
};

const createdByIds = (rows: StoredRow[]) => [...new Set(rows.map((r) => r.createdById).filter((v): v is string => !!v))];

/** Validate key, scope and value against the registry (FR-WS-08.3). */
const validateInput = (key: string, value: unknown, scope: 'workspace' | 'system'): ParameterKey => {
  if (!isParameterKey(key)) throw badRequest('unknown_parameter', { field: 'key' });
  if (PARAMETERS[key].scope !== scope) {
    // Tenants must never touch SOM-only values (FR-WS-08.7); the platform only manages system values.
    throw scope === 'workspace' ? forbidden('system_parameter_forbidden') : badRequest('not_a_system_parameter', { field: 'key' });
  }
  const error = validateParameterValue(key, value);
  if (error) throw badRequest(error, { field: 'value', key });
  return key;
};

/**
 * Admin side of the parameter store (FR-WS-08.2–08.7): settings-screen views and effective-dated
 * changes. Changes never rewrite the past — they only take effect from today/now onwards.
 */
export const createParameterAdminService = (db: Db) => ({
  /** Workspace parameters evaluated for "today" in the workspace's time zone. */
  listWorkspace: (workspaceId: string): Promise<ParameterList> =>
    db.tenant(workspaceId, async (tx) => {
      const today = isoDateInTimeZone(await parametersRepository.workspaceTimezone(tx, workspaceId));
      const keys = parameterKeysByScope('workspace');
      const rows = await parametersRepository.listWorkspaceRows(tx, workspaceId, keys);
      const names = await parametersRepository.userNames(tx, createdByIds(rows));
      const at = parseIsoDate(today);
      return { asOf: today, items: keys.map((k) => buildView(k, rows, at, (d) => toIsoDate(d)!, names)) };
    }),

  /** Schedule a workspace parameter change from `effectiveFrom` (>= today in the workspace time zone). */
  setWorkspace: (ctx: AuthContext, input: SetWorkspaceParameterInput, meta: RequestMeta): Promise<ParameterView> => {
    const key = validateInput(input.key, input.value, 'workspace');
    return db.tenant(ctx.workspaceId, async (tx) => {
      const today = isoDateInTimeZone(await parametersRepository.workspaceTimezone(tx, ctx.workspaceId));
      if (input.effectiveFrom < today) throw badRequest('effective_date_in_past', { field: 'effectiveFrom', today });
      const effectiveFrom = parseIsoDate(input.effectiveFrom);

      const oldValue = await parameterReader.workspace(tx, ctx.workspaceId, key, effectiveFrom);
      const existing = await parametersRepository.findWorkspaceRow(tx, ctx.workspaceId, key, effectiveFrom);
      // A value already in effect today may have been used; only not-yet-effective changes can be replaced.
      if (existing && input.effectiveFrom === today) throw conflict('parameter_already_changed_today', { field: 'effectiveFrom' });
      const data = { value: input.value as Prisma.InputJsonValue, reason: input.reason, createdById: ctx.userId };
      const row = existing
        ? await parametersRepository.updateWorkspaceRow(tx, existing.id, data)
        : await parametersRepository.createWorkspaceRow(tx, { ...data, workspaceId: ctx.workspaceId, key, effectiveFrom });

      await auditRepository.create(tx, {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: existing ? 'parameter.reschedule' : 'parameter.change',
        entity: 'WorkspaceParameter',
        entityId: row.id,
        meta: { key, oldValue, newValue: input.value, effectiveFrom: input.effectiveFrom, reason: input.reason, ...(existing ? { replacedValue: existing.value } : {}) } as Prisma.InputJsonValue,
        ip: meta.ip,
      });

      const rows = await parametersRepository.listWorkspaceRows(tx, ctx.workspaceId, [key]);
      const names = await parametersRepository.userNames(tx, createdByIds(rows));
      return buildView(key, rows, parseIsoDate(today), (d) => toIsoDate(d)!, names);
    });
  },

  /** System (SOM-only) parameters evaluated at the current instant. */
  listSystem: (): Promise<ParameterList> =>
    db.system(async (tx) => {
      const now = new Date();
      const keys = parameterKeysByScope('system');
      const rows = await parametersRepository.listSystemRows(tx, keys);
      const names = await platformUserRepository.namesById(tx, createdByIds(rows));
      return { asOf: now.toISOString(), items: keys.map((k) => buildView(k, rows, now, (d) => d.toISOString(), names)) };
    }),

  /** Schedule a system parameter change from `effectiveFrom` (>= now). Audited in PlatformAuditLog. */
  setSystem: (platformUserId: string, input: SetSystemParameterInput, meta: RequestMeta): Promise<ParameterView> => {
    const key = validateInput(input.key, input.value, 'system');
    const now = new Date();
    const requested = new Date(input.effectiveFrom);
    if (requested.getTime() < now.getTime() - SYSTEM_PAST_TOLERANCE_MS) throw badRequest('effective_date_in_past', { field: 'effectiveFrom' });
    const effectiveFrom = requested < now ? now : requested;

    return db.system(async (tx) => {
      const oldValue = await parameterReader.system(tx, key, effectiveFrom);
      const existing = await parametersRepository.findSystemRow(tx, key, effectiveFrom);
      const data = { value: input.value as Prisma.InputJsonValue, reason: input.reason, createdById: platformUserId };
      const row = existing
        ? await parametersRepository.updateSystemRow(tx, existing.id, data)
        : await parametersRepository.createSystemRow(tx, { ...data, key, effectiveFrom });

      await platformAuditRepository.create(tx, {
        actorId: platformUserId,
        action: existing ? 'platform.parameter.reschedule' : 'platform.parameter.change',
        entity: 'SystemParameter',
        entityId: row.id,
        meta: { key, oldValue, newValue: input.value, effectiveFrom: effectiveFrom.toISOString(), reason: input.reason } as Prisma.InputJsonValue,
        ip: meta.ip,
      });

      const rows = await parametersRepository.listSystemRows(tx, [key]);
      const names = await platformUserRepository.namesById(tx, createdByIds(rows));
      return buildView(key, rows, new Date(), (d) => d.toISOString(), names);
    });
  },
});
export type ParameterAdminService = ReturnType<typeof createParameterAdminService>;

