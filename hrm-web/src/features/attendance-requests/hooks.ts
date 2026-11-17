'use client';
import type { CreateCorrectionInput, CreateOffsitePermissionInput, OnBehalfPunchInput, ReviewDecisionInput } from '@hrm/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceRequestsApi as api } from './api';

export const attendanceRequestKeys = {
  all: ['attendance-requests'] as const,
  review: (page: number) => [...attendanceRequestKeys.all, 'review', page] as const,
  offsite: (q: object) => [...attendanceRequestKeys.all, 'offsite', q] as const,
  devices: (employeeId: string) => [...attendanceRequestKeys.all, 'devices', employeeId] as const,
  myCorrections: () => [...attendanceRequestKeys.all, 'corrections', 'me'] as const,
};

/** Every write can change several lists (queue, days, requests): refresh the whole area. */
const useAreaMutation = <TInput, TResult>(fn: (input: TInput) => Promise<TResult>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: attendanceRequestKeys.all }) });
};

export const useReviewQueue = (page: number) =>
  useQuery({ queryKey: attendanceRequestKeys.review(page), queryFn: () => api.reviewQueue(page), placeholderData: keepPreviousData });
export const useDecideReview = () => useAreaMutation((v: { id: string; body: ReviewDecisionInput }) => api.decideReview(v.id, v.body));

export const usePunchOnBehalf = () => useAreaMutation((body: OnBehalfPunchInput) => api.punchOnBehalf(body));

export const useOffsitePermissions = (q: { page: number; employeeId?: string; includeInactive?: boolean }) =>
  useQuery({ queryKey: attendanceRequestKeys.offsite(q), queryFn: () => api.offsite(q), placeholderData: keepPreviousData });
export const useCreateOffsite = () => useAreaMutation((body: CreateOffsitePermissionInput) => api.createOffsite(body));
export const useRevokeOffsite = () => useAreaMutation((id: string) => api.revokeOffsite(id));

export const useEmployeeDevices = (employeeId: string | null) =>
  useQuery({ queryKey: attendanceRequestKeys.devices(employeeId ?? ''), queryFn: () => api.devices(employeeId!), enabled: !!employeeId });
export const useResetDevice = () => useAreaMutation((id: string) => api.resetDevice(id));

export const useMyCorrections = () => useQuery({ queryKey: attendanceRequestKeys.myCorrections(), queryFn: api.myCorrections });
export const useCreateCorrection = () => useAreaMutation((body: CreateCorrectionInput) => api.createCorrection(body));
