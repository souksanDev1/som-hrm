'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shiftsApi, type AttendanceDaysParams } from './api';

export const shiftKeys = {
  shifts: ['shifts'] as const,
  roster: ['roster'] as const,
  days: ['attendance-days'] as const,
};

export const useShifts = (activeOnly = false) =>
  useQuery({ queryKey: [...shiftKeys.shifts, activeOnly], queryFn: () => shiftsApi.list(activeOnly) });

export const useRoster = (q: { from: string; to: string; departmentId?: string }) =>
  useQuery({ queryKey: [...shiftKeys.roster, q], queryFn: () => shiftsApi.roster(q) });

export const useAttendanceDays = (q: AttendanceDaysParams) =>
  useQuery({ queryKey: [...shiftKeys.days, 'list', q], queryFn: () => shiftsApi.days(q) });

export const useAttendanceSummary = (q: { month: string; employeeId?: string }) =>
  useQuery({ queryKey: [...shiftKeys.days, 'summary', q], queryFn: () => shiftsApi.summary(q) });

/**
 * Any shift or roster mutation. A roster change recomputes past days, so attendance reads are refreshed too.
 */
export const useShiftMutation = <TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([shiftKeys.shifts, shiftKeys.roster, shiftKeys.days].map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
};
