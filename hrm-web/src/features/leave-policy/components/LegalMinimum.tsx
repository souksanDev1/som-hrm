'use client';
import type { LeaveType } from '@hrm/shared';
import { fill } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';

/** Statutory minimum of a leave type (FR-LV-01.2); nothing for custom / unpaid types. */
export function LegalMinimum({ legalMin }: { legalMin: LeaveType['legalMin'] }) {
  const t = useT();
  if (!legalMin) return null;
  const parts = [
    fill(t('lvp.types.legalMin'), { days: legalMin.days }),
    legalMin.hazardousDays !== undefined ? fill(t('lvp.types.legalMinHazardous'), { days: legalMin.hazardousDays }) : null,
    legalMin.multipleBirthDays !== undefined ? fill(t('lvp.types.legalMinMultiple'), { days: legalMin.multipleBirthDays }) : null,
  ].filter(Boolean);
  return (
    <p className="text-xs text-ink-muted" data-testid="leave-legal-min">
      {parts.join(' · ')}
    </p>
  );
}
