'use client';
import type { ApprovalRequestDetail } from '@hrm/shared';
import { Card } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';
import { RequestStatusBadge } from './ApprovalBadges';
import { DecisionForm, type DecisionFormProps } from './DecisionForm';
import { StepHistory } from './StepHistory';
import { TeamOnLeave } from './TeamOnLeave';

export interface ApprovalDetailProps {
  request: ApprovalRequestDetail;
  onDecide: DecisionFormProps['onDecide'];
}

/** Summary, decision form (when the caller may decide) and step history of one request. */
export function ApprovalDetail({ request, onDecide }: ApprovalDetailProps) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card
        title={`${t(`approval.subject.${request.subjectType}`)} · ${request.summary.title}`}
        actions={<RequestStatusBadge status={request.status} />}
        data-testid="approval-detail"
      >
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-ink-muted">{t('approval.requester')}</dt>
            <dd className="text-ink dark:text-night-ink">
              {request.requester.name} · {request.requester.employeeCode}
            </dd>
          </div>
          {request.summary.detail && <dd className="text-ink dark:text-night-ink">{request.summary.detail}</dd>}
          <dd className="text-xs text-ink-muted">{fill(t('approval.submittedAt'), { date: request.submittedAt.slice(0, 10) })}</dd>
        </dl>
        {request.myCapacity && (
          <div className="mt-4 border-t border-line pt-4 dark:border-night-line">
            <p className="mb-3 text-sm text-ink-muted" data-testid="approval-my-capacity">
              {fill(t('approval.asCapacity'), { capacity: t(`approval.capacity.${request.myCapacity}`) })}
            </p>
            <DecisionForm onDecide={onDecide} />
          </div>
        )}
      </Card>
      <Card title={t('approval.history')}>
        <StepHistory steps={request.steps} requiredLevels={request.requiredLevels} requestStatus={request.status} />
      </Card>
      {request.teamOnLeave && (
        <Card title={t('approval.teamOnLeave.title')} className="lg:col-span-2">
          <TeamOnLeave members={request.teamOnLeave} />
        </Card>
      )}
    </div>
  );
}
