'use client';
import type { ParameterChange, ParameterView } from '@hrm/shared';
import { Badge, Button, Card } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { fill, formatParameterValue } from '../format';

export interface ParameterCardProps {
  parameter: ParameterView;
  /** Shows the "schedule change" action. */
  canEdit?: boolean;
  onSchedule?(parameter: ParameterView): void;
  /** Formats `effectiveFrom` for display (date vs date-time). */
  formatEffective?(value: string): string;
}

function ChangeList({ title, items, formatEffective, parameter, testId }: {
  title: string;
  items: ParameterChange[];
  parameter: ParameterView;
  formatEffective(value: string): string;
  testId: string;
}) {
  const t = useT();
  if (!items.length) return null;
  return (
    <div data-testid={testId}>
      <h3 className="mb-1 text-xs font-semibold uppercase text-ink-muted">{title}</h3>
      <ul className="flex flex-col divide-y divide-line text-sm dark:divide-night-line">
        {items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
            <span className="font-medium tabular-nums text-ink dark:text-night-ink">{formatParameterValue(t, parameter, c.value)}</span>
            <span className="tabular-nums text-ink-muted">{formatEffective(c.effectiveFrom)}</span>
            {(c.reason || c.createdByName) && (
              <span className="w-full text-xs text-ink-muted">
                {c.reason}
                {c.createdByName ? ` · ${fill(t('param.changedBy'), { name: c.createdByName })}` : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One parameter: current value, source, default, scheduled changes and history. */
export function ParameterCard({ parameter, canEdit, onSchedule, formatEffective = (v) => v }: ParameterCardProps) {
  const t = useT();
  return (
    <Card data-testid={`param-${parameter.key}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink dark:text-night-ink">{t(parameter.labelKey)}</h2>
          <p className="truncate text-xs text-ink-muted">{parameter.key}</p>
        </div>
        <Badge tone={parameter.source === 'configured' ? 'primary' : 'neutral'}>{t(`param.source.${parameter.source}`)}</Badge>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs text-ink-muted">{t('param.currentValue')}</p>
          <p className="text-lg font-semibold tabular-nums text-ink dark:text-night-ink" data-testid="param-current">
            {formatParameterValue(t, parameter, parameter.currentValue)}
          </p>
          <p className="text-xs text-ink-muted">
            {t('param.defaultValue')}: {formatParameterValue(t, parameter, parameter.defaultValue)}
          </p>
        </div>
        {canEdit && onSchedule && (
          <Button size="sm" variant="secondary" icon="event" onClick={() => onSchedule(parameter)}>
            {t('param.scheduleChange')}
          </Button>
        )}
      </div>
      <ChangeList title={t('param.scheduled')} items={parameter.scheduled} parameter={parameter} formatEffective={formatEffective} testId="param-scheduled" />
      {parameter.history.length ? (
        <details>
          <summary className="cursor-pointer text-xs font-semibold uppercase text-ink-muted">
            {t('param.history')} ({parameter.history.length})
          </summary>
          <div className="mt-2">
            <ChangeList title="" items={parameter.history} parameter={parameter} formatEffective={formatEffective} testId="param-history" />
          </div>
        </details>
      ) : (
        <p className="text-xs text-ink-muted">{t('param.noHistory')}</p>
      )}
    </Card>
  );
}
