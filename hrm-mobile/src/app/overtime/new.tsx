import type { OvertimePreviewInput } from '@hrm/shared';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Screen } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { localToday, useCreateOvertime, useOvertimePreview } from '@/features/overtime/api';
import { OvertimeRequestForm } from '@/features/overtime/OvertimeViews';
import { useT } from '@/lib/i18n';

/** Request overtime (FR-ATT-20) with the live category split and cap warning (FR-ATT-21/22). */
export default function NewOvertimeScreen() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const [period, setPeriod] = useState<OvertimePreviewInput | null>(null);
  const preview = useOvertimePreview(period);
  const create = useCreateOvertime();
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="overtime-new-screen">
      <Button title={t('common.back')} variant="ghost" onPress={() => router.back()} testID="overtime-new-back" />
      <Text className="mb-1 text-2xl font-semibold text-ink dark:text-night-ink">{t('otx.request.title')}</Text>
      <Text className="mb-4 text-sm text-ink-muted">{t('otx.request.subtitle')}</Text>
      <OvertimeRequestForm
        today={localToday()}
        preview={{ data: period ? preview.data : undefined, error: period ? preview.error : null, isFetching: preview.isFetching }}
        onPeriodChange={setPeriod}
        onSubmit={async (input) => {
          await create.mutateAsync(input);
          router.back();
        }}
      />
    </Screen>
  );
}
