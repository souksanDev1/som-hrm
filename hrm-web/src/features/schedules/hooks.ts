'use client';
import type { ApplyScheduleOverrideInput, RevertScheduleOverrideInput, SetStandardScheduleInput } from '@hrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { schedulesApi } from './api';

export const scheduleKeys = {
  all: ['schedules'] as const,
  standard: () => [...scheduleKeys.all, 'standard'] as const,
  overrides: () => [...scheduleKeys.all, 'overrides'] as const,
  employee: (id: string) => [...scheduleKeys.all, 'employee', id] as const,
};

export const useStandardSchedule = () => useQuery({ queryKey: scheduleKeys.standard(), queryFn: schedulesApi.standard });
export const useScheduleOverrides = () => useQuery({ queryKey: scheduleKeys.overrides(), queryFn: schedulesApi.overrides });
export const useEmployeeWorkSchedule = (employeeId: string) =>
  useQuery({ queryKey: scheduleKeys.employee(employeeId), queryFn: () => schedulesApi.forEmployee(employeeId) });

/** Any schedule change may move who works what, so it refreshes every schedule query. */
const useScheduleMutation = <TInput, TResult>(fn: (input: TInput) => Promise<TResult>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: scheduleKeys.all }) });
};

export const useSetStandardSchedule = () => useScheduleMutation((b: SetStandardScheduleInput) => schedulesApi.setStandard(b));
export const useApplyScheduleOverride = () => useScheduleMutation((b: ApplyScheduleOverrideInput) => schedulesApi.applyOverride(b));
export const useRevertScheduleOverride = () => useScheduleMutation((b: RevertScheduleOverrideInput) => schedulesApi.revertOverride(b));
