'use client';
import { WORKSPACE_STATUSES, type WorkspaceStatus } from '@hrm/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, Input, Modal, Pagination, QueryState, Select } from '@/components/ui';
import { CreateWorkspaceForm } from '@/features/platform/components/CreateWorkspaceForm';
import { WorkspaceList } from '@/features/platform/components/WorkspaceList';
import { useWorkspaces } from '@/features/platform/hooks';
import { useT } from '@/lib/i18n';

const PAGE_SIZE = 20;

export default function PlatformWorkspacesPage() {
  const t = useT();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<WorkspaceStatus | ''>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const query = useWorkspaces({ page, pageSize: PAGE_SIZE, search: debounced || undefined, status: status || undefined });

  return (
    <>
      <PageHeader
        title={t('platform.nav.workspaces')}
        actions={<Button icon="add_business" data-testid="new-workspace" onClick={() => setCreating(true)}>{t('platform.workspace.create')}</Button>}
      />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Input
            type="search"
            aria-label={t('common.search')}
            placeholder={t('platform.workspace.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:col-span-2"
            data-testid="workspace-search"
          />
          <Select
            aria-label={t('platform.workspace.status')}
            placeholder={t('platform.workspace.allStatuses')}
            value={status}
            data-testid="workspace-status-filter"
            onChange={(e) => {
              setStatus(e.target.value as WorkspaceStatus | '');
              setPage(1);
            }}
            options={WORKSPACE_STATUSES.map((s) => ({ value: s, label: t(`platform.workspace.status.${s}`) }))}
          />
        </div>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
          {(data) => (
            <>
              <WorkspaceList items={data.items} />
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} labels={{ previous: t('common.previous'), next: t('common.next') }} />
            </>
          )}
        </QueryState>
      </Card>
      <Modal open={creating} title={t('platform.workspace.create')} onClose={() => setCreating(false)}>
        <CreateWorkspaceForm
          onCancel={() => setCreating(false)}
          onCreated={(ws) => {
            setCreating(false);
            router.push(`/platform/workspaces/${ws.id}`);
          }}
        />
      </Modal>
    </>
  );
}
