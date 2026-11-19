import type { EmployeeDetail, OrgStructureNode } from '@hrm/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export const useMyProfile = () => useQuery({ queryKey: ['me', 'profile'], queryFn: () => apiFetch<EmployeeDetail>('/me/profile') });
export const useOrgStructure = () =>
  useQuery({ queryKey: ['org', 'structure'], queryFn: () => apiFetch<OrgStructureNode[]>('/org/structure') });
