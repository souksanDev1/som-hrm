import type { EmployeeDocument, ExpiryState } from '@hrm/shared';
import { Badge, type BadgeTone } from '@/components/ui';
import { useT } from '@/lib/i18n';

const tone: Record<ExpiryState, BadgeTone> = { EXPIRED: 'danger', EXPIRING: 'warning', VALID: 'success', NO_EXPIRY: 'neutral' };

export type ExpiryBadgeProps = Pick<EmployeeDocument, 'expiryStatus' | 'expiryThresholdDays'>;

/** Renders the expiry state computed by the API (no date math on the device). */
export function ExpiryBadge({ expiryStatus, expiryThresholdDays }: ExpiryBadgeProps) {
  const t = useT();
  const label = t(`empx.expiry.${expiryStatus}`).replace('{days}', String(expiryThresholdDays ?? ''));
  return <Badge tone={tone[expiryStatus]} label={label} testID={`expiry-${expiryStatus}`} />;
}
