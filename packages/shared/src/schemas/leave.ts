import { z } from 'zod';
import {
  GENDERS,
  HALF_DAYS,
  LEAVE_CATEGORIES,
  LEAVE_COUNTING_METHODS,
  LEAVE_LEDGER_KINDS,
  LEAVE_QUOTA_PERIODS,
  PAY_TYPES,
  REQUEST_STATUSES,
} from '../enums';
import { idSchema, isoDateSchema } from './common';

/**
 * Leave API contracts (M6, FR-LV). Days are numbers with up to 2 decimals (0.5 for half days). The API computes
 * every count, balance and eligibility result; clients only display them.
 */

// ─────────────────────────── Leave types & policies (FR-LV-01/02) ───────────────────────────

/** Leave-day quantities HR may type: halves only. */
export const leaveDaysValueSchema = z.number().finite().refine((v) => Number.isInteger(v * 2), 'leave_days_half_step');

export const leavePolicySchema = z.object({
  daysPerYear: z.number(),
  hazardousDays: z.number().nullable(),
  multipleBirthDays: z.number().nullable(),
  minServiceDays: z.number().int(),
  minServicePayTypes: z.array(z.enum(PAY_TYPES)),
});
export type LeavePolicy = z.infer<typeof leavePolicySchema>;

export const leaveTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  category: z.enum(LEAVE_CATEGORIES),
  nameLo: z.string(),
  nameEn: z.string(),
  paid: z.boolean(),
  requiresAttachment: z.boolean(),
  allowHalfDay: z.boolean(),
  gender: z.enum(GENDERS).nullable(),
  isActive: z.boolean(),
  countingMethod: z.enum(LEAVE_COUNTING_METHODS),
  quotaPeriod: z.enum(LEAVE_QUOTA_PERIODS),
  isCustom: z.boolean(),
  sortOrder: z.number().int(),
  policy: leavePolicySchema,
  /** Statutory minimum (FR-LV-01.2); null for unpaid / custom types. */
  legalMin: z.object({ days: z.number(), hazardousDays: z.number().optional(), multipleBirthDays: z.number().optional() }).nullable(),
});
export type LeaveType = z.infer<typeof leaveTypeSchema>;

const leavePolicyInputSchema = z.object({
  daysPerYear: leaveDaysValueSchema.refine((v) => v >= 0 && v <= 366, 'out_of_range'),
  hazardousDays: leaveDaysValueSchema.refine((v) => v >= 0 && v <= 366, 'out_of_range').nullable().optional(),
  multipleBirthDays: leaveDaysValueSchema.refine((v) => v >= 0 && v <= 366, 'out_of_range').nullable().optional(),
  minServiceDays: z.number().int().min(0).max(3650),
  minServicePayTypes: z.array(z.enum(PAY_TYPES)).default([]),
});

/** Edit a statutory or custom type (FR-LV-01.1); category, code and quota period of statutory types are fixed. */
export const updateLeaveTypeInputSchema = z.object({
  nameLo: z.string().trim().min(1, 'required').max(100),
  nameEn: z.string().trim().min(1, 'required').max(100),
  paid: z.boolean(),
  requiresAttachment: z.boolean(),
  allowHalfDay: z.boolean(),
  isActive: z.boolean(),
  policy: leavePolicyInputSchema,
});
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeInputSchema>;

/** New custom type (FR-LV-02), category OTHER. */
export const createLeaveTypeInputSchema = updateLeaveTypeInputSchema.extend({
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_]+$/, 'leave_type_code_format'),
  countingMethod: z.enum(LEAVE_COUNTING_METHODS),
  quotaPeriod: z.enum(LEAVE_QUOTA_PERIODS),
  gender: z.enum(GENDERS).nullable().default(null),
});
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeInputSchema>;

// ─────────────────────────── Ledger (FR-LV-07/08) ───────────────────────────

export const leaveLedgerEntrySchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  leaveTypeId: z.string(),
  periodYear: z.number().int(),
  kind: z.enum(LEAVE_LEDGER_KINDS),
  days: z.number(),
  effectiveDate: z.string(),
  leaveRequestId: z.string().nullable(),
  reason: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type LeaveLedgerEntry = z.infer<typeof leaveLedgerEntrySchema>;

/** One employee's balance of one type and year (`summarizeLedger`); `quota` null = unlimited / per request. */
export const leaveBalanceSchema = z.object({
  leaveTypeId: z.string(),
  year: z.number().int(),
  quotaPeriod: z.enum(LEAVE_QUOTA_PERIODS),
  entitled: z.number(),
  carried: z.number(),
  used: z.number(),
  adjusted: z.number(),
  expired: z.number(),
  balance: z.number(),
  /** Days in PENDING requests of that year (not yet in the ledger). */
  pending: z.number(),
});
export type LeaveBalance = z.infer<typeof leaveBalanceSchema>;

/** HR balance adjustment with a mandatory reason (FR-LV-07.2). */
export const leaveAdjustInputSchema = z.object({
  employeeId: idSchema,
  leaveTypeId: idSchema,
  periodYear: z.number().int().min(2000).max(2100),
  days: leaveDaysValueSchema.refine((v) => v !== 0 && Math.abs(v) <= 366, 'out_of_range'),
  reason: z.string().trim().min(1, 'required').max(500),
});
export type LeaveAdjustInput = z.infer<typeof leaveAdjustInputSchema>;

// ─────────────────────────── Requests (FR-LV-03/05/06/09/10/12) ───────────────────────────

const leaveRequestFieldsSchema = z.object({
  /** Filing on behalf (FR-LV-10): HR (`leave.file_on_behalf`) or a manager for their reporting line. Omit = self. */
  employeeId: idSchema.optional(),
  leaveTypeId: idSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  halfDay: z.enum(HALF_DAYS).default('NONE'),
  multipleBirth: z.boolean().default(false),
});

/** `POST /leave/requests/preview`: counts and checks without saving. */
export const leavePreviewInputSchema = leaveRequestFieldsSchema.refine((v) => v.endDate >= v.startDate, {
  path: ['endDate'],
  message: 'leave_invalid_range',
});
export type LeavePreviewInput = z.infer<typeof leavePreviewInputSchema>;

export const leaveRequestInputSchema = leaveRequestFieldsSchema
  .extend({
    reason: z.string().trim().max(500).optional(),
    /** Medical certificate uploaded via `POST /files` (purpose ATTACHMENT). */
    certificateFileId: idSchema.optional(),
    /** Requester with direct reports: who approves for them while away (FR-ORG-03.2). */
    delegateUserId: idSchema.optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: 'leave_invalid_range' });
export type LeaveRequestInput = z.infer<typeof leaveRequestInputSchema>;

/** Result of the preview, also used by the forms to show the count and balance before sending (FR-LV-06). */
export const leavePreviewSchema = z.object({
  days: z.number(),
  byYear: z.record(z.string(), z.number()),
  /** YEARLY types: balance per year before this request (minus other pending requests). */
  balanceByYear: z.record(z.string(), z.number()).nullable(),
  /** PER_EVENT types: the per-request quota. */
  quota: z.number().nullable(),
  /** Eligibility / range errors (`leave_*` codes); empty = may submit. */
  errors: z.array(z.string()),
  certificateRequired: z.boolean(),
  /** Last date to attach a missing certificate. */
  certificateDueDate: z.string().nullable(),
  /** The employee has direct reports: the form asks for a delegate (FR-ORG-03.2). */
  needsDelegate: z.boolean(),
});
export type LeavePreview = z.infer<typeof leavePreviewSchema>;

export const LEAVE_FILED_AS = ['SELF', 'HR', 'MANAGER'] as const;

export const leaveRequestSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeName: z.string(),
  leaveType: z.object({ id: z.string(), code: z.string(), nameLo: z.string(), nameEn: z.string() }),
  startDate: z.string(),
  endDate: z.string(),
  halfDay: z.enum(HALF_DAYS),
  multipleBirth: z.boolean(),
  days: z.number(),
  reason: z.string().nullable(),
  status: z.enum(REQUEST_STATUSES),
  filedAs: z.enum(LEAVE_FILED_AS),
  submittedByName: z.string().nullable(),
  certificateRequired: z.boolean(),
  certificateFileId: z.string().nullable(),
  certificateDueDate: z.string().nullable(),
  /** Approval request of the leave (subject LEAVE). */
  approvalRequestId: z.string().nullable(),
  /** Pending cancellation of an approved leave (FR-LV-12.2). */
  cancelRequest: z.object({ id: z.string(), status: z.enum(REQUEST_STATUSES), reason: z.string(), approvalRequestId: z.string().nullable() }).nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string(),
});
export type LeaveRequest = z.infer<typeof leaveRequestSchema>;

/**
 * `POST /leave/requests/:id/cancel` (FR-LV-12): a PENDING request is withdrawn at once; an APPROVED one starts a
 * cancellation that goes through approval (LEAVE_CANCEL). The reason is mandatory for approved leave.
 */
export const leaveCancelInputSchema = z.object({ reason: z.string().trim().max(500).optional() });
export type LeaveCancelInput = z.infer<typeof leaveCancelInputSchema>;

/** `PUT /leave/requests/:id/certificate` — attach a certificate later (FR-LV-05.3). */
export const leaveCertificateInputSchema = z.object({ fileId: idSchema });
export type LeaveCertificateInput = z.infer<typeof leaveCertificateInputSchema>;

// ─────────────────────────── Calendar (FR-LV-13) ───────────────────────────

export const leaveCalendarQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    /** Managers / HR (SHOULD, FR-LV-13.5). */
    departmentId: idSchema.optional(),
    leaveTypeId: idSchema.optional(),
  })
  .refine((v) => v.to >= v.from, { path: ['to'], message: 'leave_invalid_range' });
export type LeaveCalendarQuery = z.infer<typeof leaveCalendarQuerySchema>;

export const leaveCalendarEntrySchema = z.object({
  requestId: z.string(),
  employeeId: z.string(),
  employeeName: z.string(),
  departmentId: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  halfDay: z.enum(HALF_DAYS),
  status: z.enum(REQUEST_STATUSES),
  /** Hidden (null) for regular staff (FR-LV-13.6). */
  leaveType: z.object({ id: z.string(), nameLo: z.string(), nameEn: z.string() }).nullable(),
});
export type LeaveCalendarEntry = z.infer<typeof leaveCalendarEntrySchema>;
