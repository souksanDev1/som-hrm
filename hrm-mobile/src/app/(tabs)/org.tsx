import { Text } from 'react-native';
import { QueryView, Screen } from '@/components/ui';
import { OrgList } from '@/features/org/OrgList';
import { useOrgChart } from '@/features/profile/api';
import { useT } from '@/lib/i18n';

export default function OrgScreen() {
  const t = useT();
  const chart = useOrgChart();
  const title = <Text className="mb-4 text-2xl font-semibold text-ink dark:text-night-ink">{t('org.title')}</Text>;
  return (
    // The list scrolls itself (virtualised), so the screen must not wrap it in a ScrollView.
    <Screen testID="org-screen" scroll={false}>
      <QueryView query={chart} isEmpty={(d) => d.length === 0}>
        {(roots) => <OrgList roots={roots} header={title} />}
      </QueryView>
    </Screen>
  );
}
