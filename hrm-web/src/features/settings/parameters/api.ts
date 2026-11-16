import type { ParameterList, ParameterView, SetWorkspaceParameterInput } from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

export const parametersApi = {
  list: () => apiFetch<ParameterList>('/settings/parameters'),
  set: (body: SetWorkspaceParameterInput) => apiFetch<ParameterView>('/settings/parameters', { method: 'POST', body }),
};
