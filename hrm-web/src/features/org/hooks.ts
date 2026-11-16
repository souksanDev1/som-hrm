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
/**
 * Org lists. Pickers use the default (open items only); settings pass `includeClosed` to also see closed ones.
 * Both variants live under the same key prefix, so one invalidation refreshes them.
 */
export const useBranches = (includeClosed = false) =>
  useQuery({ queryKey: includeClosed ? [...orgKeys.branches, 'all'] : orgKeys.branches, queryFn: () => orgApi.branches({ includeClosed }), staleTime: 5 * 60_000 });
export const useDepartments = (includeClosed = false) =>
  useQuery({
    queryKey: includeClosed ? [...orgKeys.departments, 'all'] : orgKeys.departments,
    queryFn: () => orgApi.departments({ includeClosed }),
    staleTime: 5 * 60_000,
  });
export const usePositions = (includeClosed = false) =>
  useQuery({ queryKey: includeClosed ? [...orgKeys.positions, 'all'] : orgKeys.positions, queryFn: () => orgApi.positions({ includeClosed }), staleTime: 5 * 60_000 });

/** Generic create/delete mutation pair that refreshes the related list. */
export const useOrgMutation = <TArgs,>(key: readonly unknown[], fn: (args: TArgs) => Promise<unknown>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
};
