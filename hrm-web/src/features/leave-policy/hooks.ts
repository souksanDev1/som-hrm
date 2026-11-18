'use client';
import type { LeaveLedgerQuery, LeaveType } from '@hrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrefsStore } from '@/lib/i18n';
import { leavePolicyApi } from './api';

export const leavePolicyKeys = {
  types: ['leave-types'] as const,
  balances: ['leave-balances'] as const,
  ledger: ['leave-ledger'] as const,
};

export const useLeaveTypes = () => useQuery({ queryKey: leavePolicyKeys.types, queryFn: leavePolicyApi.types });

export const useLeaveBalances = (q: { employeeId: string; year: number }) =>
  useQuery({ queryKey: [...leavePolicyKeys.balances, q], queryFn: () => leavePolicyApi.balances(q), enabled: !!q.employeeId });

export const useLeaveLedger = (q: LeaveLedgerQuery & { employeeId: string }) =>
  useQuery({ queryKey: [...leavePolicyKeys.ledger, q], queryFn: () => leavePolicyApi.ledger(q), enabled: !!q.employeeId });

/** Any leave policy / ledger mutation; refreshes types, balances and ledger reads. */
export const useLeavePolicyMutation = <TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(Object.values(leavePolicyKeys).map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
};

/** Leave type name in the current UI language. */
export const useLeaveTypeName = () => {
  const locale = usePrefsStore((s) => s.locale);
  return (type: Pick<LeaveType, 'nameLo' | 'nameEn'> | undefined) => (type ? (locale === 'en' ? type.nameEn : type.nameLo) : '');
};
