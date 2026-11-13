import type {
  Branch,
  CreateBranchInput,
  CreateDepartmentInput,
  CreatePositionInput,
  Department,
  OrgChartNode,
  Position,
} from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

export const orgApi = {
  chart: () => apiFetch<OrgChartNode[]>('/org/chart'),
  branches: () => apiFetch<Branch[]>('/branches'),
  createBranch: (b: CreateBranchInput) => apiFetch<Branch>('/branches', { method: 'POST', body: b }),
  deleteBranch: (id: string) => apiFetch<void>(`/branches/${id}`, { method: 'DELETE' }),
  departments: () => apiFetch<Department[]>('/departments'),
  createDepartment: (b: CreateDepartmentInput) => apiFetch<Department>('/departments', { method: 'POST', body: b }),
  deleteDepartment: (id: string) => apiFetch<void>(`/departments/${id}`, { method: 'DELETE' }),
  positions: () => apiFetch<Position[]>('/positions'),
  createPosition: (b: CreatePositionInput) => apiFetch<Position>('/positions', { method: 'POST', body: b }),
  deletePosition: (id: string) => apiFetch<void>(`/positions/${id}`, { method: 'DELETE' }),
};
