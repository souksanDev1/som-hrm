import { z } from 'zod';
import { isoDateSchema } from './common';

/** Any value a registry parameter can hold; the registry validates the exact type (validateParameterValue). */
export const parameterValueSchema = z.union([z.number(), z.boolean(), z.array(z.number())]);
export type ParameterValueInput = z.infer<typeof parameterValueSchema>;

/** One stored, effective-dated value of a parameter. */
export const parameterChangeSchema = z.object({
  id: z.string(),
  value: parameterValueSchema,
  /** YYYY-MM-DD for workspace parameters, ISO date-time for system parameters. */
  effectiveFrom: z.string(),
  reason: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type ParameterChange = z.infer<typeof parameterChangeSchema>;

/** A parameter as shown in a settings screen: definition, current value and its change history. */
export const parameterViewSchema = z.object({
  key: z.string(),
  labelKey: z.string(),
  type: z.enum(['int', 'boolean', 'intList']),
  unit: z.string().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  legalMin: z.number().nullable(),
  maxItems: z.number().nullable(),
  defaultValue: parameterValueSchema,
  /** Value effective now (system) / today in the workspace time zone (workspace). */
  currentValue: parameterValueSchema,
  /** `default` = registry default applies; `configured` = a stored change applies. */
  source: z.enum(['default', 'configured']),
  /** Changes that take effect in the future, soonest first. */
  scheduled: z.array(parameterChangeSchema),
  /** Changes already in effect (incl. the current one), newest first. */
  history: z.array(parameterChangeSchema),
});
export type ParameterView = z.infer<typeof parameterViewSchema>;

export const parameterListSchema = z.object({
  /** "Today" used for the evaluation (workspace) or the evaluation instant (system). */
  asOf: z.string(),
  items: z.array(parameterViewSchema),
});
export type ParameterList = z.infer<typeof parameterListSchema>;

const reasonSchema = z.string().trim().min(1, 'required').max(500);

/** Schedule a workspace parameter change (FR-WS-08.2/08.5). `effectiveFrom` must not be in the past. */
export const setWorkspaceParameterSchema = z.object({
  key: z.string().min(1).max(100),
  value: parameterValueSchema,
  effectiveFrom: isoDateSchema,
  reason: reasonSchema,
});
export type SetWorkspaceParameterInput = z.infer<typeof setWorkspaceParameterSchema>;

/** Schedule a system parameter change (SOM only, FR-WS-08.7). `effectiveFrom` is an ISO date-time >= now. */
export const setSystemParameterSchema = z.object({
  key: z.string().min(1).max(100),
  value: parameterValueSchema,
  effectiveFrom: z.string().datetime({ offset: true, message: 'invalid_date' }),
  reason: reasonSchema,
});
export type SetSystemParameterInput = z.infer<typeof setSystemParameterSchema>;
