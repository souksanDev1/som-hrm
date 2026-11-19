import { EmployeeHeader, QueryView, Screen } from '@/components/ui';
import { OrgList } from '@/features/org/OrgList';
import { useOrgChart } from '@/features/profile/api';
import { useT } from '@/lib/i18n';

export default function OrgScreen() {
  const t = useT();
  const chart = useOrgChart();
  return (
    // The list scrolls itself (virtualised), so the screen must not wrap it in a ScrollView.
    <Screen testID="org-screen" scroll={false} header={<EmployeeHeader title={t('org.title')} back />}>
      <QueryView query={chart} isEmpty={(d) => d.length === 0}>
        {(roots) => <OrgList roots={roots} />}
      </QueryView>
    </Screen>
  );
}
