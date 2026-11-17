import { Redirect, router } from 'expo-router';
import { Text } from 'react-native';
import { Button, Card, QueryView, Screen } from '@/components/ui';
import { useCreateCorrection, useMyCorrections } from '@/features/attendance-requests/api';
import { CorrectionForm, CorrectionList } from '@/features/attendance-requests/AttendanceRequestViews';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Request a time correction and follow its status (FR-ATT-19). */
export default function CorrectionScreen() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const mine = useMyCorrections();
  const create = useCreateCorrection();
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="correction-screen">
      <Button title={t('common.back')} variant="ghost" onPress={() => router.back()} testID="correction-back" />
      <Text className="mb-1 text-2xl font-semibold text-ink dark:text-night-ink">{t('attreq.correction.title')}</Text>
      <Text className="mb-4 text-sm text-ink-muted">{t('attreq.correction.subtitle')}</Text>
      <Card title={t('attreq.correction.new')}>
        <CorrectionForm initialDate={localToday()} onSubmit={(input) => create.mutateAsync(input)} />
      </Card>
      <Card title={t('attreq.correction.mine')}>
        <QueryView query={mine} isEmpty={(d) => d.length === 0}>
          {(items) => <CorrectionList items={items} />}
        </QueryView>
      </Card>
    </Screen>
  );
}
