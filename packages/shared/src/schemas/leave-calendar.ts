import { z } from 'zod';
import { leaveCalendarEntrySchema } from './leave';

/**
 * GET /leave/calendar response (FR-LV-13). Query: `leaveCalendarQuerySchema` (schemas/leave.ts).
 * Entries are already filtered by what the viewer may see; `leaveType` is null where the type is hidden.
 */
export const leaveCalendarHolidaySchema = z.object({
  date: z.string(),
  nameLo: z.string(),
  nameEn: z.string(),
  /** 8 March: a holiday for women only — still shown on everyone's calendar, flagged. */
  womenOnly: z.boolean(),
  /** Only employees of this nationality get the day; null = everyone. */
  nationality: z.string().nullable(),
});
export type LeaveCalendarHoliday = z.infer<typeof leaveCalendarHolidaySchema>;

export const leaveCalendarViewerSchema = z.object({
  /** The viewer sees leave types (managers for their reporting tree, HR for everyone — FR-LV-13.6). */
  canSeeTypes: z.boolean(),
  /** The viewer sees PENDING requests too (FR-LV-13.7). */
  canSeePending: z.boolean(),
  /** Department / leave type filters are available (managers and HR, FR-LV-13.5). */
  canFilter: z.boolean(),
  /** HR (`leave.calendar.read_all`): every department (FR-LV-13.9). */
  allDepartments: z.boolean(),
});
export type LeaveCalendarViewer = z.infer<typeof leaveCalendarViewerSchema>;

export const leaveCalendarResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** Today in the workspace time zone (drives the "today" view). */
  today: z.string(),
  entries: z.array(leaveCalendarEntrySchema),
  holidays: z.array(leaveCalendarHolidaySchema),
  /** Dates in range that are weekly rest days on the workspace standard schedule (FR-LV-13.8). */
  restDays: z.array(z.string()),
  viewer: leaveCalendarViewerSchema,
});
export type LeaveCalendarResponse = z.infer<typeof leaveCalendarResponseSchema>;
