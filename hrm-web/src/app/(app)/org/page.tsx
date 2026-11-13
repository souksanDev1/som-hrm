'use client';
import { PERMISSIONS } from '@hrm/shared';
import { Card, QueryState } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { OrgChartTree } from '@/features/org/components/OrgChartTree';
import { useOrgChart } from '@/features/org/hooks';
import { useT } from '@/lib/i18n';

export default function OrgPage() {
  const t = useT();
  const chart = useOrgChart();
  return (
    <RequirePermission permission={PERMISSIONS.ORG_READ}>
      <PageHeader title={t('org.title')} />
      <Card>
        <QueryState query={chart} isEmpty={(d) => d.length === 0}>
          {(roots) => <OrgChartTree roots={roots} />}
        </QueryState>
      </Card>
    </RequirePermission>
  );
}
