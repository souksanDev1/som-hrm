import type { EmployeeDetail, OrgChartNode } from '@hrm/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export const useMyProfile = () => useQuery({ queryKey: ['me', 'profile'], queryFn: () => apiFetch<EmployeeDetail>('/me/profile') });
export const useOrgChart = () => useQuery({ queryKey: ['org', 'chart'], queryFn: () => apiFetch<OrgChartNode[]>('/org/chart') });
