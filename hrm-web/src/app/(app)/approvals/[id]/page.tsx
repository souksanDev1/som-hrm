'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, QueryState } from '@/components/ui';
import { ApprovalDetail } from '@/features/approvals/components/ApprovalDetail';
import { useApprovalRequest, useDecideApproval } from '@/features/approvals/hooks';
import { useT } from '@/lib/i18n';

/** One request: summary, decision form for the current approver, and the full step history (FR-ORG-06). */
export default function ApprovalDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const query = useApprovalRequest(id);
  const decide = useDecideApproval(id);
  return (
    <>
      <PageHeader
        title={t('approval.title')}
        actions={
          <Link href="/approvals">
            <Button variant="secondary" icon="arrow_back">
              {t('approval.back')}
            </Button>
          </Link>
        }
      />
      <QueryState query={query}>{(r) => <ApprovalDetail request={r} onDecide={(decision, note) => decide.mutateAsync({ decision, note })} />}</QueryState>
    </>
  );
}
