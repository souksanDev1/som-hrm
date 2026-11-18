import { z } from 'zod';
import { REQUEST_STATUSES, type HalfDay } from '../enums';
import { isValidIsoDate } from './common';
import type { LeavePreviewInput } from './leave';

/**
 * Leave filing extras (M6 agent C): the request list query and the client-side "is the form complete enough to
 * preview" check shared by web and mobile. Counting and eligibility stay on the API (`POST /leave/requests/preview`).
 */

/** `mine` = own requests; `team` = everyone in the caller's data scope (reporting tree, or all with employee.read_all). */
export const LEAVE_REQUEST_SCOPES = ['mine', 'team'] as const;
export type LeaveRequestScope = (typeof LEAVE_REQUEST_SCOPES)[number];

/** `GET /leave/requests`: `year` keeps requests overlapping that calendar (leave) year. */
export const leaveRequestListQuerySchema = z.object({
  scope: z.enum(LEAVE_REQUEST_SCOPES).default('mine'),
  status: z.enum(REQUEST_STATUSES).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type LeaveRequestListQuery = z.infer<typeof leaveRequestListQuerySchema>;

export interface LeaveFormValues {
  employeeId?: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDay: HalfDay;
  multipleBirth: boolean;
}

/** The preview body once type and both dates are filled in and ordered; `null` while the form is incomplete. */
export const leavePreviewInputOf = (v: LeaveFormValues): LeavePreviewInput | null => {
  if (!v.leaveTypeId || !isValidIsoDate(v.startDate) || !isValidIsoDate(v.endDate) || v.endDate < v.startDate) return null;
  return {
    ...(v.employeeId ? { employeeId: v.employeeId } : {}),
    leaveTypeId: v.leaveTypeId,
    startDate: v.startDate,
    endDate: v.endDate,
    halfDay: v.halfDay,
    multipleBirth: v.multipleBirth,
  };
};
