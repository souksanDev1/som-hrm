'use client';
import type { CreateWorkspaceInput, PlatformLoginInput, SetSystemParameterInput, UpdateWorkspaceInput } from '@hrm/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { platformApi, type WorkspaceFilters } from './api';
import { usePlatformAuthStore } from './store';

export const platformKeys = {
  all: ['platform'] as const,
  me: ['platform', 'me'] as const,
  workspaces: ['platform', 'workspaces'] as const,
  workspaceList: (f: WorkspaceFilters) => ['platform', 'workspaces', 'list', f] as const,
  workspace: (id: string) => ['platform', 'workspaces', 'detail', id] as const,
  parameters: ['platform', 'parameters'] as const,
  audit: (page: number) => ['platform', 'audit', page] as const,
};

export const usePlatformLogin = () => {
  const setSession = usePlatformAuthStore((s) => s.setSession);
  return useMutation({ mutationFn: (input: PlatformLoginInput) => platformApi.login(input), onSuccess: setSession });
};

export const usePlatformLogout = () => {
  const qc = useQueryClient();
  return async () => {
    const { refreshToken, clear } = usePlatformAuthStore.getState();
    clear();
    qc.removeQueries({ queryKey: platformKeys.all });
    if (refreshToken) await platformApi.logout(refreshToken).catch(() => undefined);
  };
};

/** Keeps the cached platform principal fresh (and signs out a deactivated account via 401). */
export const usePlatformMeSync = () => {
  const token = usePlatformAuthStore((s) => s.accessToken);
  const setUser = usePlatformAuthStore((s) => s.setUser);
  const query = useQuery({ queryKey: platformKeys.me, queryFn: platformApi.me, enabled: !!token, staleTime: 60_000 });
  useEffect(() => {
    if (query.data) setUser(query.data);
  }, [query.data, setUser]);
  return query;
};

export const useWorkspaces = (filters: WorkspaceFilters) =>
  useQuery({ queryKey: platformKeys.workspaceList(filters), queryFn: () => platformApi.listWorkspaces(filters), placeholderData: keepPreviousData });

export const useWorkspace = (id: string) => useQuery({ queryKey: platformKeys.workspace(id), queryFn: () => platformApi.getWorkspace(id) });

export const useCreateWorkspace = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWorkspaceInput) => platformApi.createWorkspace(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: platformKeys.workspaces }),
  });
};

export const useUpdateWorkspace = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateWorkspaceInput) => platformApi.updateWorkspace(id, body),
    onSuccess: (ws) => {
      qc.setQueryData(platformKeys.workspace(id), ws);
      return qc.invalidateQueries({ queryKey: platformKeys.workspaces });
    },
  });
};

export const useSystemParameters = () => useQuery({ queryKey: platformKeys.parameters, queryFn: platformApi.listParameters });

export const useSetSystemParameter = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetSystemParameterInput) => platformApi.setParameter(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: platformKeys.parameters }),
  });
};

export const usePlatformAuditLogs = (page: number, pageSize = 20) =>
  useQuery({ queryKey: platformKeys.audit(page), queryFn: () => platformApi.listAuditLogs(page, pageSize), placeholderData: keepPreviousData });
