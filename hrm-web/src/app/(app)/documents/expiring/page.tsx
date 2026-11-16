'use client';
import { DOCUMENT_TYPES, EXPIRING_DOCUMENT_STATES, PERMISSIONS, type DocumentType } from '@hrm/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Card, Pagination, QueryState, Select } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { ExpiringDocumentList } from '@/features/employees/components/ExpiringDocumentList';
import { useExpiringDocuments } from '@/features/employees/hooks';
import { useBranches } from '@/features/org/hooks';
import { useT } from '@/lib/i18n';

const PAGE_SIZE = 20;

/** Expiring-documents overview (FR-EMP-06), filterable by branch, document type and status; filters live in the URL. */
function ExpiringDocumentsView() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const branches = useBranches();
  const branchId = params.get('branchId') ?? '';
  const type = (params.get('type') ?? '') as DocumentType | '';
  const status = (params.get('status') ?? '') as (typeof EXPIRING_DOCUMENT_STATES)[number] | '';
  const page = Number(params.get('page') ?? 1);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    router.replace(`/documents/expiring?${next.toString()}`);
  };

  const query = useExpiringDocuments({
    page,
    pageSize: PAGE_SIZE,
    branchId: branchId || undefined,
    type: type || undefined,
    status: status || undefined,
  });

  return (
    <>
      <PageHeader title={t('empx.expiring.title')} description={t('empx.expiring.subtitle')} />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select
            id="filter-branch"
            aria-label={t('employee.branch')}
            placeholder={t('empx.expiring.allBranches')}
            value={branchId}
            onChange={(e) => setParam('branchId', e.target.value)}
            options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          />
          <Select
            id="filter-type"
            aria-label={t('document.type')}
            placeholder={t('empx.expiring.allTypes')}
            value={type}
            onChange={(e) => setParam('type', e.target.value)}
            options={DOCUMENT_TYPES.map((v) => ({ value: v, label: t(`document.${v}`) }))}
          />
          <Select
            id="filter-status"
            aria-label={t('employee.status')}
            placeholder={t('empx.expiring.allStatuses')}
            value={status}
            onChange={(e) => setParam('status', e.target.value)}
            options={EXPIRING_DOCUMENT_STATES.map((s) => ({ value: s, label: t(s === 'EXPIRING' ? 'empx.expiring.expiringSoon' : 'empx.expiry.EXPIRED') }))}
          />
        </div>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
          {(data) => (
            <>
              <ExpiringDocumentList items={data.items} />
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onChange={(p) => setParam('page', String(p))}
                labels={{ previous: t('common.previous'), next: t('common.next') }}
              />
            </>
          )}
        </QueryState>
      </Card>
    </>
  );
}

export default function ExpiringDocumentsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.EMPLOYEE_READ}>
      <Suspense>
        <ExpiringDocumentsView />
      </Suspense>
    </RequirePermission>
  );
}
