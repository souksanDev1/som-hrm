import type { ApprovalInboxItem, ApprovalRequestDetail, CreateDelegationInput, DelegateCandidate, Delegation, DelegationList, Paginated } from '@hrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { usePrefsStore } from '@/lib/i18n';

/** Summaries are rendered by the API in the account language, so inbox/detail are keyed by locale. */
export const approvalKeys = { all: ['approvals'] as const };

export const approvalsApi = {
  inbox: () => apiFetch<Paginated<ApprovalInboxItem>>('/approvals/inbox', { query: { page: 1, pageSize: 50 } }),
  get: (id: string) => apiFetch<ApprovalRequestDetail>(`/approvals/${id}`),
  approve: (id: string, note: string) => apiFetch<ApprovalRequestDetail>(`/approvals/${id}/approve`, { method: 'POST', body: note ? { note } : {} }),
  reject: (id: string, note: string) => apiFetch<ApprovalRequestDetail>(`/approvals/${id}/reject`, { method: 'POST', body: { note } }),
  delegations: () => apiFetch<DelegationList>('/approvals/delegations'),
  candidates: () => apiFetch<DelegateCandidate[]>('/approvals/delegate-candidates'),
  createDelegation: (body: CreateDelegationInput) => apiFetch<Delegation>('/approvals/delegations', { method: 'POST', body }),
  cancelDelegation: (id: string) => apiFetch<Delegation>(`/approvals/delegations/${id}/cancel`, { method: 'POST' }),
};

export const useApprovalInbox = () => {
  const locale = usePrefsStore((s) => s.locale);
  return useQuery({ queryKey: [...approvalKeys.all, 'inbox', locale], queryFn: approvalsApi.inbox });
};

export const useApprovalRequest = (id: string) => {
  const locale = usePrefsStore((s) => s.locale);
  return useQuery({ queryKey: [...approvalKeys.all, 'detail', id, locale], queryFn: () => approvalsApi.get(id) });
};

export const useDelegations = () => useQuery({ queryKey: [...approvalKeys.all, 'delegations'], queryFn: approvalsApi.delegations });
export const useDelegateCandidates = (enabled: boolean) =>
  useQuery({ queryKey: [...approvalKeys.all, 'candidates'], queryFn: approvalsApi.candidates, enabled, staleTime: 5 * 60_000 });

/** Decisions and delegation changes move requests in or out of the inbox: refresh everything. */
const useApprovalMutation = <TInput, TResult>(fn: (input: TInput) => Promise<TResult>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: approvalKeys.all }) });
};

export const useDecideApproval = (id: string) =>
  useApprovalMutation((d: { decision: 'approve' | 'reject'; note: string }) =>
    d.decision === 'approve' ? approvalsApi.approve(id, d.note) : approvalsApi.reject(id, d.note),
  );
export const useCreateDelegation = () => useApprovalMutation(approvalsApi.createDelegation);
export const useCancelDelegation = () => useApprovalMutation(approvalsApi.cancelDelegation);
