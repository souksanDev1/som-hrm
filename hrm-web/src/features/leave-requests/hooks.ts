'use client';
import type { LeaveCancelInput, LeaveRequestListQuery } from '@hrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leaveRequestsApi } from './api';

export const leaveKeys = {
  all: ['leave'] as const,
  types: () => ['leave', 'types'] as const,
  balances: (year?: number) => ['leave', 'balances', year ?? null] as const,
  list: (query: Partial<LeaveRequestListQuery>) => ['leave', 'requests', query] as const,
  detail: (id: string) => ['leave', 'request', id] as const,
};

export const useLeaveTypes = () => useQuery({ queryKey: leaveKeys.types(), queryFn: leaveRequestsApi.types, staleTime: 5 * 60_000 });
export const useMyLeaveBalances = (year?: number) => useQuery({ queryKey: leaveKeys.balances(year), queryFn: () => leaveRequestsApi.balances(year) });
export const useLeaveRequests = (query: Partial<LeaveRequestListQuery> = {}) =>
  useQuery({ queryKey: leaveKeys.list(query), queryFn: () => leaveRequestsApi.list(query) });
export const useLeaveRequest = (id: string) => useQuery({ queryKey: leaveKeys.detail(id), queryFn: () => leaveRequestsApi.get(id) });

/** Any leave change moves balances, lists and the detail: refresh every leave query. */
const useLeaveMutation = <TInput, TResult>(fn: (input: TInput) => Promise<TResult>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: leaveKeys.all }) });
};

export const useCreateLeaveRequest = () => useLeaveMutation(leaveRequestsApi.create);
export const useAttachCertificate = (id: string) => useLeaveMutation((fileId: string) => leaveRequestsApi.attachCertificate(id, fileId));
export const useCancelLeaveRequest = (id: string) => useLeaveMutation((body: LeaveCancelInput) => leaveRequestsApi.cancel(id, body));
