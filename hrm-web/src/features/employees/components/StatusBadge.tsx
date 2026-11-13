import type { EmploymentStatus } from '@hrm/shared';
import { Badge, type BadgeTone } from '@/components/ui';
import { useT } from '@/lib/i18n';

const tone: Record<EmploymentStatus, BadgeTone> = {
  PROBATION: 'warning',
  ACTIVE: 'success',
  ON_LEAVE: 'primary',
  RESIGNED: 'neutral',
  TERMINATED: 'danger',
};

export function StatusBadge({ status }: { status: EmploymentStatus }) {
  const t = useT();
  return <Badge tone={tone[status]}>{t(`status.${status}`)}</Badge>;
}
