'use client';
import { PERMISSIONS } from '@hrm/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryState } from '@/components/ui';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { OverrideManager } from '@/features/schedules/components/OverrideManager';
import { StandardScheduleCard } from '@/features/schedules/components/StandardScheduleCard';
import {
  useApplyScheduleOverride,
  useRevertScheduleOverride,
  useScheduleOverrides,
  useSetStandardSchedule,
  useStandardSchedule,
} from '@/features/schedules/hooks';
import { useT } from '@/lib/i18n';

/** Working schedules (FR-WS-03): workspace standard + individual schedules. Needs `schedule.manage`. */
export default function WorkSchedulePage() {
  const t = useT();
  const standard = useStandardSchedule();
  const overrides = useScheduleOverrides();
  const setStandard = useSetStandardSchedule();
  const apply = useApplyScheduleOverride();
  const revert = useRevertScheduleOverride();

  return (
    <RequirePermission permission={PERMISSIONS.SCHEDULE_MANAGE}>
      <PageHeader title={t('schedule.title')} description={t('schedule.subtitle')} />
      <QueryState query={standard}>
        {(std) => (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <StandardScheduleCard view={std} onSubmit={(input) => setStandard.mutateAsync(input)} />
            <QueryState query={overrides}>
              {(list) => (
                <OverrideManager
                  rows={list.items}
                  standard={std}
                  onApply={(input) => apply.mutateAsync(input)}
                  onRevert={(input) => revert.mutateAsync(input)}
                />
              )}
            </QueryState>
          </div>
        )}
      </QueryState>
    </RequirePermission>
  );
}
