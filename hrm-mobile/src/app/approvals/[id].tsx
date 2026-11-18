import { interpolate } from '@hrm/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Card, QueryView, Screen } from '@/components/ui';
import { useApprovalRequest, useDecideApproval } from '@/features/approvals/api';
import { ApprovalDecisionPanel, ApprovalStepList, RequestStatusBadge } from '@/features/approvals/ApprovalViews';
import { TeamOnLeaveList } from '@/features/approvals/TeamOnLeaveList';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';

/** One request: summary, approve/reject for the current approver and the step history (FR-ORG-06). */
export default function ApprovalDetailScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useAuthStore((s) => s.accessToken);
  const request = useApprovalRequest(id);
  const decide = useDecideApproval(id);
  if (!token) return <Redirect href="/login" />;

  return (
    <Screen testID="approval-detail-screen">
      <Button title={t('approval.back')} variant="ghost" onPress={() => router.back()} testID="approval-back" />
      <QueryView query={request}>
        {(r) => (
          <>
            <Card title={`${t(`approval.subject.${r.subjectType}`)} · ${r.summary.title}`} right={<RequestStatusBadge status={r.status} />} testID="approval-detail">
              <View className="gap-1">
                <Text className="text-sm text-ink dark:text-night-ink">{`${t('approval.requester')}: ${r.requester.name} · ${r.requester.employeeCode}`}</Text>
                {r.summary.detail ? <Text className="text-sm text-ink dark:text-night-ink">{r.summary.detail}</Text> : null}
                <Text className="text-xs text-ink-muted">{interpolate(t('approval.submittedAt'), { date: r.submittedAt.slice(0, 10) })}</Text>
              </View>
            </Card>
            {r.myCapacity ? (
              <Card>
                <ApprovalDecisionPanel capacity={r.myCapacity} onDecide={(decision, note) => decide.mutateAsync({ decision, note })} />
              </Card>
            ) : null}
            {r.teamOnLeave ? (
              <Card title={t('approval.teamOnLeave.title')}>
                <TeamOnLeaveList members={r.teamOnLeave} />
              </Card>
            ) : null}
            <Card title={t('approval.history')}>
              <ApprovalStepList steps={r.steps} requiredLevels={r.requiredLevels} requestStatus={r.status} />
            </Card>
          </>
        )}
      </QueryView>
    </Screen>
  );
}
