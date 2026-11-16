import {
  createApiClient,
  type CreateWorkspaceInput,
  type Paginated,
  type ParameterList,
  type ParameterView,
  type PlatformAuditLogEntry,
  type PlatformLoginInput,
  type PlatformLoginResponse,
  type PlatformMe,
  type PlatformWorkspace,
  type SetSystemParameterInput,
  type UpdateWorkspaceInput,
  type WorkspaceStatus,
} from '@hrm/shared';
import { API_URL } from '@/lib/api-client';
import { usePlatformAuthStore } from './store';

/** Client for /platform/*: its own tokens; refresh goes to /platform/auth/refresh. */
const platformFetch = createApiClient({
  baseUrl: `${API_URL}/platform`,
  tokens: {
    getAccessToken: () => usePlatformAuthStore.getState().accessToken,
    getRefreshToken: () => usePlatformAuthStore.getState().refreshToken,
    setTokens: (t) => usePlatformAuthStore.getState().setTokens(t),
    clear: () => usePlatformAuthStore.getState().clear(),
  },
});

export interface WorkspaceFilters {
  page: number;
  pageSize: number;
  search?: string;
  status?: WorkspaceStatus;
}

export const platformApi = {
  login: (body: PlatformLoginInput) => platformFetch<PlatformLoginResponse>('/auth/login', { method: 'POST', body, auth: false }),
  logout: (refreshToken: string) => platformFetch<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
  me: () => platformFetch<PlatformMe>('/auth/me'),
  listWorkspaces: (f: WorkspaceFilters) => platformFetch<Paginated<PlatformWorkspace>>('/workspaces', { query: { ...f } }),
  getWorkspace: (id: string) => platformFetch<PlatformWorkspace>(`/workspaces/${id}`),
  createWorkspace: (body: CreateWorkspaceInput) => platformFetch<PlatformWorkspace>('/workspaces', { method: 'POST', body }),
  updateWorkspace: (id: string, body: UpdateWorkspaceInput) => platformFetch<PlatformWorkspace>(`/workspaces/${id}`, { method: 'PATCH', body }),
  listParameters: () => platformFetch<ParameterList>('/parameters'),
  setParameter: (body: SetSystemParameterInput) => platformFetch<ParameterView>('/parameters', { method: 'POST', body }),
  listAuditLogs: (page: number, pageSize: number) => platformFetch<Paginated<PlatformAuditLogEntry>>('/audit-logs', { query: { page, pageSize } }),
};
