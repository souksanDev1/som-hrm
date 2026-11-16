'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, QueryState } from '@/components/ui';
import { WorkspaceDetail } from '@/features/platform/components/WorkspaceDetail';
import { useWorkspace } from '@/features/platform/hooks';
import { useT } from '@/lib/i18n';

export default function PlatformWorkspaceDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const query = useWorkspace(id);
  return (
    <>
      <PageHeader
        title={t('platform.workspace.detail')}
        actions={<Link href="/platform"><Button variant="secondary" icon="arrow_back">{t('common.back')}</Button></Link>}
      />
      <QueryState query={query}>{(ws) => <WorkspaceDetail workspace={ws} />}</QueryState>
    </>
  );
}
