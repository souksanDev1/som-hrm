'use client';
import { PERMISSIONS, type OrgStructureNode } from '@hrm/shared';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Button, Card, QueryState } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { useHasPermission } from '@/features/auth/store';
import { OrgStructureChart } from '@/features/org/components/OrgStructureChart';
import { StructureDetailPanel } from '@/features/org/components/StructureDetailPanel';
import { useOrgStructure } from '@/features/org/hooks';
import { useT } from '@/lib/i18n';

export default function OrgPage() {
  const t = useT();
  const structure = useOrgStructure();
  const canManage = useHasPermission(PERMISSIONS.ORG_WRITE);
  const [detail, setDetail] = useState<OrgStructureNode | null>(null);
  const close = useCallback(() => setDetail(null), []);
  return (
    <RequirePermission permission={PERMISSIONS.ORG_READ}>
      <PageHeader
        title={t('org.title')}
        actions={
          canManage && (
            <Link href="/org/manage">
              <Button variant="secondary" icon="edit" data-testid="org-manage">
                {t('org.manage.title')}
              </Button>
            </Link>
          )
        }
      />
      <Card className="h-[calc(100dvh-12rem)] min-h-[480px] overflow-hidden p-0 sm:p-0">
        <QueryState query={structure}>{(roots) => <OrgStructureChart roots={roots} onOpenDetail={setDetail} />}</QueryState>
      </Card>
      <StructureDetailPanel node={detail} onClose={close} />
    </RequirePermission>
  );
}
