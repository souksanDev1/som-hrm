import { z } from 'zod';
import { isValidTimeZone } from '../domain/parameters';
import { WORKSPACE_STATUSES } from '../enums';
import { passwordSchema, tokenPairSchema, workspaceCodeSchema } from './auth';
import { emptyToUndefined, laoPhoneSchema, paginationQuerySchema } from './common';

/** SOM platform console (super admin) contracts — FR-WS-01.1, FR-WS-08.7. */

export const platformLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('invalid_email').max(120),
  password: z.string().min(1, 'required').max(200),
});
export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;

export const platformMeSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
});
export type PlatformMe = z.infer<typeof platformMeSchema>;

export const platformLoginResponseSchema = tokenPairSchema.extend({ user: platformMeSchema });
export type PlatformLoginResponse = z.infer<typeof platformLoginResponseSchema>;

export const workspaceStatusSchema = z.enum(WORKSPACE_STATUSES);

export const timeZoneSchema = z.string().trim().min(1).max(64).refine(isValidTimeZone, 'invalid_timezone');

export const platformWorkspaceSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  timezone: z.string(),
  status: workspaceStatusSchema,
  seatLimit: z.number().int(),
  /** Employees that occupy a seat (not resigned / terminated). */
  employeeCount: z.number().int(),
  userCount: z.number().int(),
  createdAt: z.string(),
});
export type PlatformWorkspace = z.infer<typeof platformWorkspaceSchema>;

export const platformWorkspaceListQuerySchema = paginationQuerySchema.extend({
  status: workspaceStatusSchema.optional(),
});
export type PlatformWorkspaceListQuery = z.infer<typeof platformWorkspaceListQuerySchema>;

export const SEAT_LIMIT_MAX = 100_000;
const seatLimitSchema = z.coerce.number().int().min(1, 'out_of_range').max(SEAT_LIMIT_MAX, 'out_of_range');

/** Create a customer workspace with its first owner (email and/or Lao phone). */
export const createWorkspaceSchema = z.object({
  code: workspaceCodeSchema,
  name: z.string().trim().min(1, 'required').max(200),
  timezone: emptyToUndefined(timeZoneSchema),
  seatLimit: emptyToUndefined(seatLimitSchema),
  owner: z
    .object({
      displayName: z.string().trim().min(1, 'required').max(120),
      email: emptyToUndefined(z.string().trim().toLowerCase().email('invalid_email').max(120)),
      phone: emptyToUndefined(laoPhoneSchema),
      password: passwordSchema,
    })
    .refine((o) => !!o.email || !!o.phone, { message: 'owner_contact_required', path: ['email'] }),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(1, 'required').max(200).optional(),
    seatLimit: seatLimitSchema.optional(),
    status: workspaceStatusSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'required' });
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const platformAuditLogSchema = z.object({
  id: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  actorName: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.string(),
  meta: z.unknown().nullable(),
});
export type PlatformAuditLogEntry = z.infer<typeof platformAuditLogSchema>;

export const platformAuditLogQuerySchema = paginationQuerySchema.extend({
  entity: z.string().max(60).optional(),
});
