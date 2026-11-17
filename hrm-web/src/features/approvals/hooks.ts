'use client';
import type { CreateDelegationInput, UpdateDelegationInput } from '@hrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrefsStore } from '@/lib/i18n';
import { approvalsApi } from './api';

/** Summaries are rendered by the API in the account language, so inbox/detail queries are keyed by locale. */
export const approvalKeys = {
  all: ['approvals'] as const,
  inbox: (page: number, locale: string) => [...approvalKeys.all, 'inbox', page, locale] as const,
  detail: (id: string, locale: string) => [...approvalKeys.all, 'detail', id, locale] as const,
  delegations: () => [...approvalKeys.all, 'delegations'] as const,
  candidates: () => [...approvalKeys.all, 'candidates'] as const,
};

export const useApprovalInbox = (page: number) => {
  const locale = usePrefsStore((s) => s.locale);
  return useQuery({ queryKey: approvalKeys.inbox(page, locale), queryFn: () => approvalsApi.inbox(page) });
};

export const useApprovalRequest = (id: string) => {
  const locale = usePrefsStore((s) => s.locale);
  return useQuery({ queryKey: approvalKeys.detail(id, locale), queryFn: () => approvalsApi.get(id) });
};

export const useDelegations = () => useQuery({ queryKey: approvalKeys.delegations(), queryFn: approvalsApi.delegations });
export const useDelegateCandidates = (enabled: boolean) =>
  useQuery({ queryKey: approvalKeys.candidates(), queryFn: approvalsApi.candidates, enabled, staleTime: 5 * 60_000 });

/** A decision or delegation change can move requests in or out of the inbox: refresh everything. */
const useApprovalMutation = <TInput, TResult>(fn: (input: TInput) => Promise<TResult>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: approvalKeys.all }) });
};

export const useDecideApproval = (id: string) =>
  useApprovalMutation((d: { decision: 'approve' | 'reject'; note: string }) =>
    d.decision === 'approve' ? approvalsApi.approve(id, d.note || undefined) : approvalsApi.reject(id, d.note),
  );
export const useCreateDelegation = () => useApprovalMutation((b: CreateDelegationInput) => approvalsApi.createDelegation(b));
export const useUpdateDelegation = () => useApprovalMutation((v: { id: string; body: UpdateDelegationInput }) => approvalsApi.updateDelegation(v.id, v.body));
export const useCancelDelegation = () => useApprovalMutation((id: string) => approvalsApi.cancelDelegation(id));
