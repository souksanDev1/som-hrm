import { interpolate } from '@hrm/shared';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Button, Card, QueryView, Screen } from '@/components/ui';
import { useCancelDelegation, useCreateDelegation, useDelegateCandidates, useDelegations } from '@/features/approvals/api';
import { DelegationForm, DelegationList } from '@/features/approvals/DelegationViews';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';
import { errorCode } from '@/lib/api';

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Approval delegates (FR-ORG-03.1): list, appoint and cancel the signed-in manager's own. */
export default function DelegationsScreen() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.user?.id);
  const list = useDelegations();
  const candidates = useDelegateCandidates(!!list.data?.canDelegate);
  const create = useCreateDelegation();
  const cancel = useCancelDelegation();
  const [adding, setAdding] = useState(false);
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="delegations-screen">
      <Button title={t('common.back')} variant="ghost" onPress={() => router.back()} testID="delegations-back" />
      <Text className="mb-1 text-2xl font-semibold text-ink dark:text-night-ink">{t('delegation.title')}</Text>
      <Text className="mb-4 text-sm text-ink-muted">{t('delegation.subtitle')}</Text>
      <QueryView query={list}>
        {(data) => (
          <>
            {data.canDelegate ? (
              adding ? (
                <Card title={t('delegation.add')}>
                  <DelegationForm
                    candidates={candidates.data ?? []}
                    today={localToday()}
                    onSubmit={async (input) => {
                      await create.mutateAsync(input);
                      setAdding(false);
                    }}
                  />
                </Card>
              ) : (
                <Button title={t('delegation.add')} onPress={() => setAdding(true)} testID="delegation-add" className="mb-4" />
              )
            ) : (
              <Text className="mb-4 text-sm text-ink-muted">{t('delegation.notManager')}</Text>
            )}
            <Card>
              <DelegationList
                items={data.items}
                userId={userId}
                onCancel={(d) =>
                  Alert.alert(t('delegation.cancel'), interpolate(t('delegation.cancelConfirm'), { name: d.delegate.name }), [
                    { text: t('common.no'), style: 'cancel' },
                    {
                      text: t('common.yes'),
                      style: 'destructive',
                      onPress: () => cancel.mutate(d.id, { onError: (err) => Alert.alert(t(errorCode(err))) }),
                    },
                  ])
                }
              />
            </Card>
          </>
        )}
      </QueryView>
    </Screen>
  );
}
