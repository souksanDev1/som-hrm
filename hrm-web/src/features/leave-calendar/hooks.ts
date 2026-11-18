'use client';
import type { LeaveCalendarQuery } from '@hrm/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { leaveCalendarApi } from './api';

/** Leave calendar for a range; keeps the previous period on screen while the next one loads. */
export const useLeaveCalendar = (q: LeaveCalendarQuery) =>
  useQuery({ queryKey: ['leave', 'calendar', q], queryFn: () => leaveCalendarApi.calendar(q), placeholderData: keepPreviousData });

/** Leave types for the type filter (managers / HR only). */
export const useLeaveTypes = (enabled: boolean) =>
  useQuery({ queryKey: ['leave', 'types'], queryFn: leaveCalendarApi.types, enabled, staleTime: 5 * 60_000 });
