import { interpolate as fill, type ApprovalTeamLeave } from '@hrm/shared';
import { Text, View } from 'react-native';
import { Badge } from '@/components/ui';
import { useT } from '@/lib/i18n';

/** Team members on leave on overlapping dates, shown to approvers of a leave request (FR-LV-13.10). */
export function TeamOnLeaveList({ members }: { members: readonly ApprovalTeamLeave[] }) {
  const t = useT();
  if (!members.length) {
    return (
      <Text className="text-sm text-ink-muted" testID="team-on-leave-empty">
        {t('approval.teamOnLeave.empty')}
      </Text>
    );
  }
  return (
    <View testID="team-on-leave">
      {members.map((m) => (
        <View key={m.requestId} testID="team-on-leave-item" className="flex-row items-center justify-between gap-2 border-b border-line py-2 last:border-b-0 dark:border-night-line">
          <View className="flex-1 gap-0.5">
            <Text className="text-sm font-medium text-ink dark:text-night-ink">{`${m.name} · ${m.employeeCode}`}</Text>
            <Text className="text-xs text-ink-muted">
              {`${m.startDate === m.endDate ? m.startDate : `${m.startDate} – ${m.endDate}`}${m.halfDay !== 'NONE' ? ` (${t(`leave.halfDay.${m.halfDay}`)})` : ''} · ${fill(t('leave.days'), { days: m.days })}`}
            </Text>
          </View>
          {m.status === 'PENDING' ? <Badge tone="warning" label={t('approval.teamOnLeave.pending')} /> : null}
        </View>
      ))}
    </View>
  );
}
