'use client';
import type { AttendanceStatus } from '@hrm/shared';
import { Badge } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { STATUS_TONE } from '../format';

/** Localised day status (`attendance.status.*`) in its tone. */
export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  const t = useT();
  return <Badge tone={STATUS_TONE[status]}>{t(`attendance.status.${status}`)}</Badge>;
}
