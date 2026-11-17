import { z } from 'zod';
import { APPROVAL_CAPACITIES, APPROVAL_DECISIONS, APPROVAL_SUBJECT_TYPES, REQUEST_STATUSES } from '../enums';
import { idSchema, isoDateSchema, paginationQuerySchema } from './common';

const noteSchema = z.string().trim().max(500);

/** A user named in the approval history. */
export const approvalPartySchema = z.object({ userId: z.string(), name: z.string() });
export type ApprovalParty = z.infer<typeof approvalPartySchema>;

/** One-line description of the subject, rendered by its module in the caller's language. */
export const approvalSummarySchema = z.object({ title: z.string(), detail: z.string().nullable() });
export type ApprovalSummary = z.infer<typeof approvalSummarySchema>;

export const approvalRequesterSchema = z.object({ employeeId: z.string(), employeeCode: z.string(), name: z.string() });

/** One step of the history (FR-ORG-06): who it was routed to, who decided it and in what capacity. */
export const approvalStepSchema = z.object({
  id: z.string(),
  level: z.number().int(),
  /** The manager owning the step; null = HR fallback (anyone holding `approval.hr_fallback`). */
  approver: approvalPartySchema.nullable(),
  /** Delegate who could act for the manager when the step was routed. */
  delegate: approvalPartySchema.nullable(),
  /** Routed capacity while pending; the capacity actually used once decided. */
  actingAs: z.enum(APPROVAL_CAPACITIES),
  decision: z.enum(APPROVAL_DECISIONS),
  decidedBy: approvalPartySchema.nullable(),
  decidedAt: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type ApprovalStep = z.infer<typeof approvalStepSchema>;

/** A request waiting for the caller (inbox row). */
export const approvalInboxItemSchema = z.object({
  id: z.string(),
  subjectType: z.enum(APPROVAL_SUBJECT_TYPES),
  requester: approvalRequesterSchema,
  summary: approvalSummarySchema,
  /** In-app route of the request. */
  link: z.string(),
  level: z.number().int(),
  requiredLevels: z.number().int(),
  /** Capacity the caller would act in. */
  myCapacity: z.enum(APPROVAL_CAPACITIES),
  submittedAt: z.string(),
  /** When the current step started waiting. */
  pendingSince: z.string(),
});
export type ApprovalInboxItem = z.infer<typeof approvalInboxItemSchema>;

export const approvalInboxQuerySchema = paginationQuerySchema.omit({ search: true });
export type ApprovalInboxQuery = z.infer<typeof approvalInboxQuerySchema>;

export const approvalRequestDetailSchema = z.object({
  id: z.string(),
  subjectType: z.enum(APPROVAL_SUBJECT_TYPES),
  subjectId: z.string(),
  status: z.enum(REQUEST_STATUSES),
  requester: approvalRequesterSchema,
  summary: approvalSummarySchema,
  link: z.string(),
  currentStep: z.number().int(),
  requiredLevels: z.number().int(),
  submittedAt: z.string(),
  decidedAt: z.string().nullable(),
  /** Oldest first. */
  steps: z.array(approvalStepSchema),
  /** Capacity the caller may decide the pending step in; null when they may not. */
  myCapacity: z.enum(APPROVAL_CAPACITIES).nullable(),
});
export type ApprovalRequestDetail = z.infer<typeof approvalRequestDetailSchema>;

export const approveRequestSchema = z.object({ note: noteSchema.optional() });
export type ApproveRequestInput = z.infer<typeof approveRequestSchema>;

/** A rejection always says why. */
export const rejectRequestSchema = z.object({ note: noteSchema.min(1, 'required') });
export type RejectRequestInput = z.infer<typeof rejectRequestSchema>;

// ───────────── Delegations (FR-ORG-03) ─────────────

export const DELEGATION_STATUSES = ['ACTIVE', 'SCHEDULED', 'ENDED', 'CANCELLED'] as const;
export type DelegationStatus = (typeof DELEGATION_STATUSES)[number];

export const delegationSchema = z.object({
  id: z.string(),
  delegator: approvalPartySchema,
  delegate: approvalPartySchema,
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().nullable(),
  /** Relative to today in the workspace time zone. */
  status: z.enum(DELEGATION_STATUSES),
  createdAt: z.string(),
});
export type Delegation = z.infer<typeof delegationSchema>;

export const delegationListSchema = z.object({
  /** The caller has direct reports (or `approval.delegate.manage`) and may appoint a delegate. */
  canDelegate: z.boolean(),
  /** The caller holds `approval.delegate.manage`: the list covers every manager. */
  canManageAll: z.boolean(),
  items: z.array(delegationSchema),
});
export type DelegationList = z.infer<typeof delegationListSchema>;

const endNotBeforeStart = (v: { startDate: string; endDate: string }) => v.endDate >= v.startDate;
const endIssue = { message: 'end_before_start', path: ['endDate'] };

const delegationFields = z.object({
  delegateUserId: idSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  reason: z.string().trim().max(500).optional(),
});

/** Appoint a delegate. `delegatorUserId` (another manager) needs `approval.delegate.manage`. */
export const createDelegationSchema = delegationFields.extend({ delegatorUserId: idSchema.optional() }).refine(endNotBeforeStart, endIssue);
export type CreateDelegationInput = z.infer<typeof createDelegationSchema>;

export const updateDelegationSchema = delegationFields.refine(endNotBeforeStart, endIssue);
export type UpdateDelegationInput = z.infer<typeof updateDelegationSchema>;

/** Active user who can be picked as a delegate. */
export const delegateCandidateSchema = z.object({
  userId: z.string(),
  name: z.string(),
  employeeCode: z.string().nullable(),
  /** Has direct reports (selectable as delegator by HR). */
  isManager: z.boolean(),
});
export type DelegateCandidate = z.infer<typeof delegateCandidateSchema>;

/**
 * FR-ORG-03.2: a manager files leave for [startDate, endDate]. Without `delegateUserId` the answer
 * says whether a delegate is still needed; with it, the delegation is created for the absence.
 */
export const absenceDelegationSchema = z
  .object({ startDate: isoDateSchema, endDate: isoDateSchema, delegateUserId: idSchema.optional() })
  .refine(endNotBeforeStart, endIssue);
export type AbsenceDelegationInput = z.infer<typeof absenceDelegationSchema>;

export const absenceDelegationResultSchema = z.object({
  /** The absent employee approves requests and the period is not fully covered by a delegation. */
  needsDelegate: z.boolean(),
  /** Delegation covering the period (created now or existing). */
  delegation: delegationSchema.nullable(),
});
export type AbsenceDelegationResult = z.infer<typeof absenceDelegationResultSchema>;
