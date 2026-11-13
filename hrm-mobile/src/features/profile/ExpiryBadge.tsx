import { documentExpiryStatus, type ExpiryStatus } from '@hrm/shared';
import { Badge, type BadgeTone } from '@/components/ui';
import { useT } from '@/lib/i18n';

const tone: Record<ExpiryStatus, BadgeTone> = { EXPIRED: 'danger', D30: 'danger', D60: 'warning', D90: 'warning', VALID: 'success', NO_EXPIRY: 'neutral' };

export function ExpiryBadge({ expiresAt, now }: { expiresAt: string | null; now?: Date }) {
  const t = useT();
  const status = documentExpiryStatus(expiresAt ? new Date(`${expiresAt}T00:00:00Z`) : null, now);
  return <Badge tone={tone[status]} label={t(`expiry.${status}`)} testID={`expiry-${status}`} />;
}
