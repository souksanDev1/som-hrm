'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { orgApi } from './api';

export const orgKeys = {
  chart: ['org', 'chart'] as const,
  branches: ['org', 'branches'] as const,
  departments: ['org', 'departments'] as const,
  positions: ['org', 'positions'] as const,
};

export const useOrgChart = () => useQuery({ queryKey: orgKeys.chart, queryFn: orgApi.chart });
export const useBranches = () => useQuery({ queryKey: orgKeys.branches, queryFn: orgApi.branches, staleTime: 5 * 60_000 });
export const useDepartments = () => useQuery({ queryKey: orgKeys.departments, queryFn: orgApi.departments, staleTime: 5 * 60_000 });
export const usePositions = () => useQuery({ queryKey: orgKeys.positions, queryFn: orgApi.positions, staleTime: 5 * 60_000 });

/** Generic create/delete mutation pair that refreshes the related list. */
export const useOrgMutation = <TArgs,>(key: readonly unknown[], fn: (args: TArgs) => Promise<unknown>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
};
