import { EmployeeHeader, QueryView, Screen } from '@/components/ui';
import { OrgStructureList } from '@/features/org/OrgStructureList';
import { useOrgStructure } from '@/features/profile/api';
import { useT } from '@/lib/i18n';

export default function OrgScreen() {
  const t = useT();
  const structure = useOrgStructure();
  return (
    // The list scrolls itself (virtualised), so the screen must not wrap it in a ScrollView.
    <Screen testID="org-screen" scroll={false} header={<EmployeeHeader title={t('org.title')} back />}>
      <QueryView query={structure} isEmpty={(d) => d.length === 0}>
        {(roots) => <OrgStructureList roots={roots} />}
      </QueryView>
    </Screen>
  );
}
