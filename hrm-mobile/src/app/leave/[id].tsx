import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Button, QueryView, Screen } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { useAttachCertificatePhoto, useCancelLeaveRequest, useLeaveRequest } from '@/features/leave/api';
import { LeaveDetail } from '@/features/leave/LeaveViews';
import { useT } from '@/lib/i18n';

/** One leave request (deep link `/leave/:id`, e.g. certificate reminder): certificate attach and cancellation. */
export default function LeaveDetailScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useAuthStore((s) => s.accessToken);
  const request = useLeaveRequest(id);
  const attach = useAttachCertificatePhoto(id);
  const cancel = useCancelLeaveRequest(id);
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="leave-detail-screen">
      <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/leave'))} testID="leave-detail-back" />
      <Text className="mb-4 text-2xl font-semibold text-ink dark:text-night-ink">{t('lvr.detail.title')}</Text>
      <QueryView query={request}>
        {(r) => <LeaveDetail request={r} onAttachPhoto={(uri) => attach.mutateAsync(uri)} onCancel={(reason) => cancel.mutateAsync(reason ? { reason } : {})} />}
      </QueryView>
    </Screen>
  );
}
