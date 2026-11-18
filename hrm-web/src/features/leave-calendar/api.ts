import type { LeaveCalendarQuery, LeaveCalendarResponse, LeaveType } from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

export const leaveCalendarApi = {
  calendar: (q: LeaveCalendarQuery) => apiFetch<LeaveCalendarResponse>('/leave/calendar', { query: { ...q } }),
  types: () => apiFetch<LeaveType[]>('/leave/types'),
};
