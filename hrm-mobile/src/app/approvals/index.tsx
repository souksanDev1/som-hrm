import { Redirect, router } from 'expo-router';
import { Text } from 'react-native';
import { Button, QueryView, Screen } from '@/components/ui';
import { useApprovalInbox } from '@/features/approvals/api';
import { ApprovalInboxList } from '@/features/approvals/ApprovalViews';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';

/** Approval inbox (FR-ORG-02), opened from the home tab. */
export default function ApprovalsScreen() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const inbox = useApprovalInbox();
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="approvals-screen">
      <Button title={t('common.back')} variant="ghost" onPress={() => router.back()} testID="approvals-back" />
      <Text className="mb-1 text-2xl font-semibold text-ink dark:text-night-ink">{t('approval.title')}</Text>
      <Text className="mb-4 text-sm text-ink-muted">{t('approval.subtitle')}</Text>
      <Button title={t('delegation.title')} variant="secondary" onPress={() => router.push('/approvals/delegations')} testID="open-delegations" className="mb-4" />
      <QueryView query={inbox}>
        {(data) =>
          data.items.length === 0 ? (
            <Text className="py-8 text-center text-sm text-ink-muted" testID="approvals-empty">
              {t('approval.inbox.empty')}
            </Text>
          ) : (
            <ApprovalInboxList items={data.items} onOpen={(id) => router.push(`/approvals/${id}`)} />
          )
        }
      </QueryView>
    </Screen>
  );
}
