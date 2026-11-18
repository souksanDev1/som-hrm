import type { CalendarRange, LeaveCalendarResponse } from '@hrm/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

/** Leave calendar for a range (FR-LV-13); the API applies the viewer's visibility rules. */
export const useLeaveCalendar = (range: CalendarRange) =>
  useQuery({
    queryKey: ['leave', 'calendar', range.from, range.to],
    queryFn: () => apiFetch<LeaveCalendarResponse>('/leave/calendar', { query: { from: range.from, to: range.to } }),
    placeholderData: keepPreviousData,
  });

/** Today in the device's zone (the workspace's for Lao users); the API's `today` wins once loaded. */
export const deviceToday = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
