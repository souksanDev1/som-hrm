'use client';
import type { StandardScheduleVersion, StandardScheduleView } from '@hrm/shared';
import { useState } from 'react';
import { Button, Card, Modal } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';
import { formatHours } from '../format';
import { PatternForm, type PatternFormInput } from './PatternForm';
import { WeekPattern } from './WeekPattern';

function VersionList({ title, items, testId }: { title: string; items: StandardScheduleVersion[]; testId: string }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <div data-testid={testId}>
      {title && <h3 className="mb-1 text-xs font-semibold uppercase text-ink-muted">{title}</h3>}
      <ul className="flex flex-col divide-y divide-line dark:divide-night-line">
        {items.map((v) => (
          <li key={v.id} className="flex flex-col gap-1.5 py-2">
            <p className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium tabular-nums text-ink dark:text-night-ink">{fill(t('schedule.since'), { date: v.effectiveFrom })}</span>
              <span className="tabular-nums text-ink-muted">{fill(t('schedule.hours'), { hours: formatHours(v.weeklyHours) })}</span>
            </p>
            <WeekPattern dayHours={v.dayHours} />
            {(v.reason || v.createdByName) && (
              <p className="text-xs text-ink-muted">
                {v.reason}
                {v.createdByName ? ` · ${fill(t('schedule.changedBy'), { name: v.createdByName })}` : ''}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface StandardScheduleCardProps {
  view: StandardScheduleView;
  onSubmit(input: PatternFormInput): Promise<unknown>;
}

/** Workspace standard (FR-WS-03.1): current pattern, scheduled versions, history and the change dialog. */
export function StandardScheduleCard({ view, onSubmit }: StandardScheduleCardProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const past = view.history.filter((v) => v.id !== view.current.id);
  return (
    <Card
      title={t('schedule.standard.title')}
      data-testid="standard-schedule"
      actions={
        <Button size="sm" variant="secondary" icon="event" onClick={() => setEditing(true)}>
          {t('schedule.standard.change')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="flex flex-wrap justify-between gap-2 text-sm">
          <span className="tabular-nums text-ink-muted">{fill(t('schedule.since'), { date: view.current.effectiveFrom })}</span>
          <span className="font-semibold tabular-nums text-ink dark:text-night-ink" data-testid="standard-weekly-hours">
            {fill(t('schedule.hours'), { hours: formatHours(view.current.weeklyHours) })}
          </span>
        </p>
        <WeekPattern dayHours={view.current.dayHours} data-testid="standard-current" />
        <p className="text-xs text-ink-muted">
          {fill(t('schedule.limits'), { day: view.limits.maxHoursPerDay, week: view.limits.maxHoursPerWeek })} · {t('schedule.standard.note')}
        </p>
        <VersionList title={t('schedule.scheduled')} items={view.scheduled} testId="standard-scheduled" />
        {past.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase text-ink-muted">
              {t('schedule.history')} ({past.length})
            </summary>
            <div className="mt-2">
              <VersionList title="" items={past} testId="standard-history" />
            </div>
          </details>
        )}
      </div>
      <Modal open={editing} title={t('schedule.standard.change')} onClose={() => setEditing(false)}>
        {editing && (
          <PatternForm
            idPrefix="standard"
            initialDayHours={view.current.dayHours}
            limits={view.limits}
            today={view.asOf}
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              await onSubmit(input);
              setEditing(false);
            }}
          />
        )}
      </Modal>
    </Card>
  );
}
