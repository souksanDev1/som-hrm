import { z } from 'zod';
import { GENDERS, LEAVE_CATEGORIES, LEAVE_COUNTING_METHODS, LEAVE_QUOTA_PERIODS } from '../enums';
import { idSchema } from './common';
import { leaveLedgerEntrySchema, updateLeaveTypeInputSchema } from './leave';

/**
 * Leave policy & ledger API contracts (M6 agent B, FR-LV-01/02/07/08) on top of the base leave schemas.
 */

/**
 * `PUT /leave/types/:id` body. Code and category never change; counting method, quota period and gender may change
 * on custom types only — on a statutory type a different value is rejected with 400 `leave_type_field_locked`.
 */
export const leaveTypeUpdateRequestSchema = updateLeaveTypeInputSchema.extend({
  code: z.string().optional(),
  category: z.enum(LEAVE_CATEGORIES).optional(),
  countingMethod: z.enum(LEAVE_COUNTING_METHODS).optional(),
  quotaPeriod: z.enum(LEAVE_QUOTA_PERIODS).optional(),
  gender: z.enum(GENDERS).nullable().optional(),
});
export type LeaveTypeUpdateRequest = z.infer<typeof leaveTypeUpdateRequestSchema>;

/** Fields of a leave type that are fixed on statutory types (FR-LV-01). */
export const LEAVE_TYPE_LOCKED_FIELDS = ['code', 'category', 'countingMethod', 'quotaPeriod', 'gender'] as const;
/** Fields fixed on every type, custom ones included. */
export const LEAVE_TYPE_IMMUTABLE_FIELDS = ['code', 'category'] as const;

/** `GET /leave/ledger`: one employee's movements (default: oneself), optionally one type and/or leave year. */
export const leaveLedgerQuerySchema = z.object({
  employeeId: idSchema.optional(),
  leaveTypeId: idSchema.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type LeaveLedgerQuery = z.infer<typeof leaveLedgerQuerySchema>;

export const leaveLedgerListSchema = z.array(leaveLedgerEntrySchema);
