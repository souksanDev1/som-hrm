import type { LeavePreviewInput } from '@hrm/shared';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, QueryView, Screen } from '@/components/ui';
import { useDelegateCandidates } from '@/features/approvals/api';
import { useAuthStore } from '@/features/auth/store';
import { leaveApi, useCreateLeaveRequest, useLeavePreview, useLeaveTypes } from '@/features/leave/api';
import { LeaveRequestForm } from '@/features/leave/LeaveViews';
import { useT } from '@/lib/i18n';

/** Request leave (FR-LV-03/05/06) with the live API preview and, for managers, a delegate (FR-ORG-03.2). */
export default function NewLeaveScreen() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const types = useLeaveTypes();
  const [input, setInput] = useState<LeavePreviewInput | null>(null);
  const preview = useLeavePreview(input);
  const create = useCreateLeaveRequest();
  const delegates = useDelegateCandidates(!!preview.data?.needsDelegate);
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="leave-new-screen">
      <Button title={t('common.back')} variant="ghost" onPress={() => router.back()} testID="leave-new-back" />
      <Text className="mb-1 text-2xl font-semibold text-ink dark:text-night-ink">{t('lvr.form.title')}</Text>
      <Text className="mb-4 text-sm text-ink-muted">{t('lvr.form.subtitle')}</Text>
      <QueryView query={types}>
        {(list) => (
          <LeaveRequestForm
            types={list}
            delegates={delegates.data ?? []}
            preview={{ data: input ? preview.data : undefined, error: input ? preview.error : null }}
            onInputChange={setInput}
            onUploadPhoto={leaveApi.uploadCertificatePhoto}
            onSubmit={async (body) => {
              await create.mutateAsync(body);
              router.back();
            }}
          />
        )}
      </QueryView>
    </Screen>
  );
}
