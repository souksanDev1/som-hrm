import type { EmployeeDocument, ExpiryState } from '@hrm/shared';
import { Badge, type BadgeTone } from '@/components/ui';
import { useT } from '@/lib/i18n';

const tone: Record<ExpiryState, BadgeTone> = {
  EXPIRED: 'danger',
  EXPIRING: 'warning',
  VALID: 'success',
  NO_EXPIRY: 'neutral',
};

export type ExpiryBadgeProps = Pick<EmployeeDocument, 'expiryStatus' | 'expiryThresholdDays'>;

/** Document expiry state exactly as computed by the API (workspace thresholds + timezone). */
export function ExpiryBadge({ expiryStatus, expiryThresholdDays }: ExpiryBadgeProps) {
  const t = useT();
  const label = t(`empx.expiry.${expiryStatus}`).replace('{days}', String(expiryThresholdDays ?? ''));
  return (
    <Badge tone={tone[expiryStatus]} className="tabular-nums">
      <span data-expiry={expiryStatus} data-threshold={expiryThresholdDays ?? undefined}>
        {label}
      </span>
    </Badge>
  );
}
