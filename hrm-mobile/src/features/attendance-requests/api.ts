import type { Correction, CreateCorrectionInput, CreateDeviceChangeInput, DeviceChangeRequest } from '@hrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export const attendanceRequestKeys = {
  all: ['attendance-requests'] as const,
  corrections: () => [...attendanceRequestKeys.all, 'corrections'] as const,
  deviceRequests: () => [...attendanceRequestKeys.all, 'device-requests'] as const,
};

/** Employee attendance requests: time correction (FR-ATT-19) and device change (FR-ATT-11.2). */
export const attendanceRequestsApi = {
  myCorrections: () => apiFetch<Correction[]>('/attendance/corrections/me'),
  createCorrection: (body: CreateCorrectionInput) => apiFetch<Correction>('/attendance/corrections', { method: 'POST', body }),
  myDeviceRequests: () => apiFetch<DeviceChangeRequest[]>('/attendance/device-change-requests/me'),
  requestDeviceChange: (body: CreateDeviceChangeInput) => apiFetch<DeviceChangeRequest>('/attendance/device-change-requests', { method: 'POST', body }),
};

const useAreaMutation = <TInput, TResult>(fn: (input: TInput) => Promise<TResult>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: attendanceRequestKeys.all }) });
};

export const useMyCorrections = () => useQuery({ queryKey: attendanceRequestKeys.corrections(), queryFn: attendanceRequestsApi.myCorrections });
export const useCreateCorrection = () => useAreaMutation(attendanceRequestsApi.createCorrection);
export const useMyDeviceRequests = () => useQuery({ queryKey: attendanceRequestKeys.deviceRequests(), queryFn: attendanceRequestsApi.myDeviceRequests });
export const useRequestDeviceChange = () => useAreaMutation(attendanceRequestsApi.requestDeviceChange);
