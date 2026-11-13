import { Text } from 'react-native';
import { Card, QueryView, Screen } from '@/components/ui';
import { OrgList } from '@/features/org/OrgList';
import { useOrgChart } from '@/features/profile/api';
import { useT } from '@/lib/i18n';

export default function OrgScreen() {
  const t = useT();
  const chart = useOrgChart();
  return (
    <Screen testID="org-screen">
      <Text className="mb-4 text-2xl font-semibold text-ink dark:text-night-ink">{t('org.title')}</Text>
      <Card>
        <QueryView query={chart} isEmpty={(d) => d.length === 0}>
          {(roots) => <OrgList roots={roots} />}
        </QueryView>
      </Card>
    </Screen>
  );
}
