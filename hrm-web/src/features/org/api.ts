import type {
  Branch,
  CreateBranchInput,
  CreateDepartmentInput,
  CreatePositionInput,
  Department,
  OrgChartNode,
  OrgListQuery,
  Position,
  UpdateBranchInput,
  UpdateDepartmentInput,
} from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

export type OrgEntityPath = 'branches' | 'departments' | 'positions';

const listQuery = (q: OrgListQuery) => ({ includeClosed: q.includeClosed ? 'true' : undefined });

export const orgApi = {
  chart: () => apiFetch<OrgChartNode[]>('/org/chart'),
  branches: (q: OrgListQuery = {}) => apiFetch<Branch[]>('/branches', { query: listQuery(q) }),
  createBranch: (b: CreateBranchInput) => apiFetch<Branch>('/branches', { method: 'POST', body: b }),
  updateBranch: (id: string, b: UpdateBranchInput) => apiFetch<Branch>(`/branches/${id}`, { method: 'PATCH', body: b }),
  deleteBranch: (id: string) => apiFetch<void>(`/branches/${id}`, { method: 'DELETE' }),
  departments: (q: OrgListQuery = {}) => apiFetch<Department[]>('/departments', { query: listQuery(q) }),
  createDepartment: (b: CreateDepartmentInput) => apiFetch<Department>('/departments', { method: 'POST', body: b }),
  updateDepartment: (id: string, b: UpdateDepartmentInput) =>
    apiFetch<Department>(`/departments/${id}`, { method: 'PATCH', body: b }),
  deleteDepartment: (id: string) => apiFetch<void>(`/departments/${id}`, { method: 'DELETE' }),
  positions: (q: OrgListQuery = {}) => apiFetch<Position[]>('/positions', { query: listQuery(q) }),
  createPosition: (b: CreatePositionInput) => apiFetch<Position>('/positions', { method: 'POST', body: b }),
  updatePosition: (id: string, b: Partial<CreatePositionInput>) => apiFetch<Position>(`/positions/${id}`, { method: 'PATCH', body: b }),
  deletePosition: (id: string) => apiFetch<void>(`/positions/${id}`, { method: 'DELETE' }),
  /** Close (deactivate) or reopen a branch, department or position (FR-WS-02). */
  setActive: <T,>(entity: OrgEntityPath, id: string, isActive: boolean) =>
    apiFetch<T>(`/${entity}/${id}/${isActive ? 'reopen' : 'close'}`, { method: 'POST' }),
};
