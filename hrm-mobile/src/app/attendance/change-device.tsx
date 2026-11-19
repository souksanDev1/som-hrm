import type { DeviceInfo } from '@hrm/shared';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { BackButton, Card, QueryView, Screen } from '@/components/ui';
import { useMyDeviceRequests, useRequestDeviceChange } from '@/features/attendance-requests/api';
import { ChangeDeviceForm, DeviceRequestList } from '@/features/attendance-requests/AttendanceRequestViews';
import { useAuthStore } from '@/features/auth/store';
import { getDeviceInfo } from '@/features/checkin/device';
import { useT } from '@/lib/i18n';

/** Ask HR to move the attendance binding to this phone (FR-ATT-11.2/11.3). */
export default function ChangeDeviceScreen() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const history = useMyDeviceRequests();
  const request = useRequestDeviceChange();
  useEffect(() => {
    void getDeviceInfo().then(setDevice);
  }, []);
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="change-device-screen">
      <BackButton onPress={() => router.back()} testID="change-device-back" />
      <Text className="mb-1 text-2xl font-semibold text-ink dark:text-night-ink">{t('attreq.deviceChange.title')}</Text>
      <Text className="mb-4 text-sm text-ink-muted">{t('attreq.deviceChange.intro')}</Text>
      <Card>{device ? <ChangeDeviceForm device={device} onSubmit={(input) => request.mutateAsync(input)} /> : null}</Card>
      <Card title={t('attreq.deviceChange.history')}>
        <QueryView query={history} isEmpty={(d) => d.length === 0}>
          {(items) => <DeviceRequestList items={items} />}
        </QueryView>
      </Card>
    </Screen>
  );
}
