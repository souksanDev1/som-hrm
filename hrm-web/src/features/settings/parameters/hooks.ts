'use client';
import type { SetWorkspaceParameterInput } from '@hrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parametersApi } from './api';

export const parameterKeys = { all: ['settings', 'parameters'] as const };

export const useWorkspaceParameters = () => useQuery({ queryKey: parameterKeys.all, queryFn: parametersApi.list });

export const useSetWorkspaceParameter = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetWorkspaceParameterInput) => parametersApi.set(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: parameterKeys.all }),
  });
};
