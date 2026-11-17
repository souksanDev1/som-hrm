import type {
  ApprovalInboxItem,
  ApprovalRequestDetail,
  CreateDelegationInput,
  DelegateCandidate,
  Delegation,
  DelegationList,
  Paginated,
  UpdateDelegationInput,
} from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

/** Approvals inbox and delegations (FR-ORG-02..06). */
export const approvalsApi = {
  inbox: (page: number) => apiFetch<Paginated<ApprovalInboxItem>>('/approvals/inbox', { query: { page } }),
  get: (id: string) => apiFetch<ApprovalRequestDetail>(`/approvals/${id}`),
  approve: (id: string, note?: string) => apiFetch<ApprovalRequestDetail>(`/approvals/${id}/approve`, { method: 'POST', body: note ? { note } : {} }),
  reject: (id: string, note: string) => apiFetch<ApprovalRequestDetail>(`/approvals/${id}/reject`, { method: 'POST', body: { note } }),
  delegations: () => apiFetch<DelegationList>('/approvals/delegations'),
  createDelegation: (body: CreateDelegationInput) => apiFetch<Delegation>('/approvals/delegations', { method: 'POST', body }),
  updateDelegation: (id: string, body: UpdateDelegationInput) => apiFetch<Delegation>(`/approvals/delegations/${id}`, { method: 'PATCH', body }),
  cancelDelegation: (id: string) => apiFetch<Delegation>(`/approvals/delegations/${id}/cancel`, { method: 'POST' }),
  candidates: () => apiFetch<DelegateCandidate[]>('/approvals/delegate-candidates'),
};
