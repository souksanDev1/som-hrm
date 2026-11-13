'use client';
import type { CreateDocumentInput, CreateEmergencyContactInput, CreateEmployeeInput, UpdateEmployeeInput } from '@hrm/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { employeesApi, type EmployeeFilters } from './api';

export const employeeKeys = {
  all: ['employees'] as const,
  list: (f: EmployeeFilters) => [...employeeKeys.all, 'list', f] as const,
  detail: (id: string) => [...employeeKeys.all, 'detail', id] as const,
};

export const useEmployees = (filters: EmployeeFilters) =>
  useQuery({ queryKey: employeeKeys.list(filters), queryFn: () => employeesApi.list(filters), placeholderData: keepPreviousData });

export const useEmployee = (id: string) => useQuery({ queryKey: employeeKeys.detail(id), queryFn: () => employeesApi.get(id) });

/** Shared invalidation: any employee mutation refreshes lists and the org chart. */
const useInvalidate = () => {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: employeeKeys.all }), qc.invalidateQueries({ queryKey: ['org'] })]);
};

export const useCreateEmployee = () => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (b: CreateEmployeeInput) => employeesApi.create(b), onSuccess: invalidate });
};

export const useUpdateEmployee = (id: string) => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (b: UpdateEmployeeInput) => employeesApi.update(id, b), onSuccess: invalidate });
};

export const useEmployeeDocuments = (id: string) => {
  const invalidate = useInvalidate();
  return {
    add: useMutation({ mutationFn: (b: CreateDocumentInput) => employeesApi.addDocument(id, b), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (docId: string) => employeesApi.removeDocument(id, docId), onSuccess: invalidate }),
  };
};

export const useEmergencyContacts = (id: string) => {
  const invalidate = useInvalidate();
  return {
    add: useMutation({ mutationFn: (b: CreateEmergencyContactInput) => employeesApi.addContact(id, b), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (cId: string) => employeesApi.removeContact(id, cId), onSuccess: invalidate }),
  };
};

export const useIssueCredential = (id: string) => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (method: 'PIN' | 'PASSWORD') => employeesApi.issueCredential(id, method), onSuccess: invalidate });
};
