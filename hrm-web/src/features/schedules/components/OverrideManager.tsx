'use client';
import type { ScheduleOverrideRow, StandardScheduleView } from '@hrm/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, Checkbox, Modal, StateView } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';
import { formatPatternSummary } from '../format';
import { EmployeePicker } from './EmployeePicker';
import { PatternForm, type PatternFormInput } from './PatternForm';
import { RevertForm } from './RevertForm';
import { WeekPattern } from './WeekPattern';

export interface OverrideManagerProps {
  rows: readonly ScheduleOverrideRow[];
  /** The standard: prefills the pattern, gives limits and today. */
  standard: StandardScheduleView;
  onApply(input: PatternFormInput & { employeeIds: string[] }): Promise<unknown>;
  onRevert(input: { employeeIds: string[]; effectiveFrom: string; reason: string }): Promise<unknown>;
}

/** Employees with an individual schedule: bulk apply (FR-WS-03.2/03.3) and revert to standard (FR-WS-03.4). */
export function OverrideManager({ rows, standard, onApply, onRevert }: OverrideManagerProps) {
  const t = useT();
  const [selected, setSelected] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [reverting, setReverting] = useState<string[] | null>(null);
  // Only rows working an override on the revert date can be reverted; today is the safe default check.
  const revertable = rows.filter((r) => r.current.source === 'override').map((r) => r.employee.id);
  const selectedRevertable = selected.filter((id) => revertable.includes(id));
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  return (
    <Card
      title={t('schedule.overrides.title')}
      data-testid="override-manager"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon="undo"
            disabled={!selectedRevertable.length}
            onClick={() => setReverting(selectedRevertable)}
            data-testid="bulk-revert"
          >
            {t('schedule.overrides.revert')}
          </Button>
          <Button
            size="sm"
            icon="person_add"
            onClick={() => {
              setPicked(selected);
              setApplying(true);
            }}
          >
            {t('schedule.overrides.apply')}
          </Button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <StateView kind="empty" title={t('schedule.overrides.empty')} />
      ) : (
        <ul className="flex flex-col divide-y divide-line dark:divide-night-line">
          {rows.map((r) => (
            <li key={r.employee.id} className="flex flex-col gap-2 py-3" data-testid={`override-row-${r.employee.employeeCode}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Checkbox
                  id={`override-${r.employee.id}`}
                  label={`${r.employee.employeeCode} · ${r.employee.name}`}
                  checked={selected.includes(r.employee.id)}
                  onChange={(e) => toggle(r.employee.id, e.target.checked)}
                />
                <div className="flex items-center gap-2">
                  <Badge tone={r.current.source === 'override' ? 'primary' : 'neutral'}>{t(`schedule.source.${r.current.source}`)}</Badge>
                  {r.current.source === 'override' && (
                    <Button size="sm" variant="ghost" icon="undo" onClick={() => setReverting([r.employee.id])}>
                      {t('schedule.overrides.revert')}
                    </Button>
                  )}
                </div>
              </div>
              <WeekPattern dayHours={r.current.dayHours} />
              <p className="text-xs text-ink-muted">
                {[r.current.label, formatPatternSummary(t, r.current), fill(t('schedule.since'), { date: r.current.effectiveFrom })]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {r.next && (
                <p className="text-xs font-medium text-warning" data-testid="override-next">
                  {fill(t('schedule.overrides.next'), {
                    date: r.next.effectiveFrom,
                    pattern: r.next.source === 'standard' ? t('schedule.backToStandard') : (r.next.label ?? t('schedule.source.override')),
                  })}
                </p>
              )}
              <Link href={`/employees/${r.employee.id}`} className="self-start text-xs text-primary hover:underline">
                {t('nav.profile')}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal open={applying} title={t('schedule.overrides.apply')} onClose={() => setApplying(false)}>
        {applying && (
          <PatternForm
            idPrefix="override"
            initialDayHours={standard.current.dayHours}
            limits={standard.limits}
            today={standard.asOf}
            withLabel
            submitDisabled={picked.length === 0}
            onCancel={() => setApplying(false)}
            onSubmit={async (input) => {
              await onApply({ ...input, employeeIds: picked });
              setApplying(false);
              setSelected([]);
            }}
          >
            <EmployeePicker selected={picked} onChange={setPicked} />
          </PatternForm>
        )}
      </Modal>
      <Modal open={!!reverting} title={t('schedule.overrides.revert')} onClose={() => setReverting(null)}>
        {reverting && (
          <RevertForm
            count={reverting.length}
            today={standard.asOf}
            onCancel={() => setReverting(null)}
            onSubmit={async (input) => {
              await onRevert({ ...input, employeeIds: reverting });
              setReverting(null);
              setSelected((s) => s.filter((id) => !reverting.includes(id)));
            }}
          />
        )}
      </Modal>
    </Card>
  );
}
