import type {
  CreateLeaveTypeInput,
  LeaveAdjustInput,
  LeaveBalance,
  LeaveLedgerEntry,
  LeaveLedgerQuery,
  LeaveType,
  LeaveTypeUpdateRequest,
} from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

export interface LeaveBalancesResponse {
  employeeId: string;
  year: number;
  balances: LeaveBalance[];
}

/** Leave type settings (FR-LV-01/02) and the balance ledger (FR-LV-07). */
export const leavePolicyApi = {
  types: () => apiFetch<LeaveType[]>('/leave/types'),
  createType: (body: CreateLeaveTypeInput) => apiFetch<LeaveType>('/leave/types', { method: 'POST', body }),
  updateType: (id: string, body: LeaveTypeUpdateRequest) => apiFetch<LeaveType>(`/leave/types/${id}`, { method: 'PUT', body }),
  balances: (q: { employeeId: string; year: number }) => apiFetch<LeaveBalancesResponse>('/leave/balances', { query: { ...q } }),
  ledger: (q: LeaveLedgerQuery) => apiFetch<LeaveLedgerEntry[]>('/leave/ledger', { query: { ...q } }),
  adjust: (body: LeaveAdjustInput) => apiFetch<LeaveLedgerEntry>('/leave/ledger/adjustments', { method: 'POST', body }),
};
