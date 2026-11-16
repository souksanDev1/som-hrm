'use client';
import type {
  CreateDocumentInput,
  CreateEmergencyContactInput,
  CreateEmployeeInput,
  EmployeeImportFormat,
  UpdateEmergencyContactInput,
  UpdateEmployeeInput,
} from '@hrm/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { employeesApi, type EmployeeFilters, type ExpiringDocumentFilters } from './api';

export const employeeKeys = {
  all: ['employees'] as const,
  list: (f: EmployeeFilters) => [...employeeKeys.all, 'list', f] as const,
  detail: (id: string) => [...employeeKeys.all, 'detail', id] as const,
  history: (id: string, page: number) => [...employeeKeys.all, 'history', id, page] as const,
  expiring: (f: ExpiringDocumentFilters) => [...employeeKeys.all, 'expiring-documents', f] as const,
};

export const useEmployees = (filters: EmployeeFilters) =>
  useQuery({ queryKey: employeeKeys.list(filters), queryFn: () => employeesApi.list(filters), placeholderData: keepPreviousData });

export const useEmployee = (id: string) => useQuery({ queryKey: employeeKeys.detail(id), queryFn: () => employeesApi.get(id) });

/** Employment history, newest first (paginated by the API). */
export const useEmployeeHistory = (id: string, page: number, pageSize = 10) =>
  useQuery({
    queryKey: employeeKeys.history(id, page),
    queryFn: () => employeesApi.history(id, { page, pageSize }),
    placeholderData: keepPreviousData,
  });

/** Expired / expiring documents across the caller's data scope (FR-EMP-06). */
export const useExpiringDocuments = (filters: ExpiringDocumentFilters) =>
  useQuery({ queryKey: employeeKeys.expiring(filters), queryFn: () => employeesApi.expiringDocuments(filters), placeholderData: keepPreviousData });

/** Manager picker options (FR-EMP-03.3 / 08.3): the first 100 employees by code, as the list API allows. */
export const useManagerOptions = () =>
  useQuery({
    queryKey: employeeKeys.list({ pageSize: 100 }),
    queryFn: () => employeesApi.list({ pageSize: 100 }),
    select: (d) => d.items.map((e) => ({ value: e.id, label: `${e.employeeCode} · ${e.firstName} ${e.lastName}` })),
  });

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
    update: useMutation({
      mutationFn: ({ contactId, body }: { contactId: string; body: UpdateEmergencyContactInput }) => employeesApi.updateContact(id, contactId, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (cId: string) => employeesApi.removeContact(id, cId), onSuccess: invalidate }),
  };
};

/** Bulk import (FR-EMP-09): preview writes nothing; confirm creates every row or none. */
export const useEmployeeImport = () => {
  const invalidate = useInvalidate();
  return {
    preview: useMutation({ mutationFn: (file: File) => employeesApi.previewImport(file) }),
    confirm: useMutation({
      mutationFn: ({ file, importToken }: { file: File; importToken: string }) => employeesApi.confirmImport(file, importToken),
      onSuccess: invalidate,
    }),
    template: useMutation({ mutationFn: (format: EmployeeImportFormat) => employeesApi.downloadImportTemplate(format) }),
  };
};

export const useIssueCredential = (id: string) => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (method: 'PIN' | 'PASSWORD') => employeesApi.issueCredential(id, method), onSuccess: invalidate });
};
