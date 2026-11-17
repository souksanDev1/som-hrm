'use client';
import type { RosterView, Shift } from '@hrm/shared';
import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Field, Input, Select } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { rangeDates } from '../format';
import { ROSTER_REST, ROSTER_SCHEDULE, type RosterChoice } from './RosterGrid';

export interface RosterBulkCell {
  employeeId: string;
  date: string;
}

export interface RosterBulkFormProps {
  employees: RosterView['employees'];
  shifts: readonly Shift[];
  defaultFrom: string;
  defaultTo: string;
  saving?: boolean;
  /** Longest range allowed (the API's roster limit). */
  maxDays: number;
  onApply(cells: RosterBulkCell[], choice: RosterChoice): Promise<unknown>;
}

/** Fill a date range for several employees with one shift, a rest day, or back to the schedule (FR-ATT-17.3). */
export function RosterBulkForm({ employees, shifts, defaultFrom, defaultTo, saving, maxDays, onApply }: RosterBulkFormProps) {
  const t = useT();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [choice, setChoice] = useState<RosterChoice>(shifts[0]?.id ?? ROSTER_REST);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!from || !to || to < from) return setError('range_invalid');
    const dates = rangeDates(from, to, maxDays + 1);
    if (dates.length > maxDays) return setError('range_too_long');
    if (selected.size === 0) return setError('required');
    setError(null);
    const cells = [...selected].flatMap((employeeId) => dates.map((date) => ({ employeeId, date })));
    await onApply(cells, choice).catch(() => undefined);
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate data-testid="roster-bulk">
      <p className="text-sm text-ink-muted">{t('roster.bulkHint')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('roster.from')} htmlFor="roster-bulk-from">
          <Input id="roster-bulk-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t('roster.to')} htmlFor="roster-bulk-to">
          <Input id="roster-bulk-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label={t('roster.shift')} htmlFor="roster-bulk-shift">
          <Select
            id="roster-bulk-shift"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            options={[
              ...shifts.map((s) => ({ value: s.id, label: s.code ? `${s.code} · ${s.name}` : s.name })),
              { value: ROSTER_REST, label: t('roster.rest') },
              { value: ROSTER_SCHEDULE, label: t('roster.clearCell') },
            ]}
          />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium text-ink dark:text-night-ink">{t('roster.employees')}</legend>
        <Checkbox
          id="roster-bulk-all"
          label={t('roster.selectAll')}
          checked={employees.length > 0 && selected.size === employees.length}
          onChange={(e) => setSelected(e.target.checked ? new Set(employees.map((x) => x.id)) : new Set())}
        />
        <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
          {employees.map((x) => (
            <Checkbox
              key={x.id}
              id={`roster-bulk-emp-${x.id}`}
              label={`${x.employeeCode} · ${x.name}`}
              checked={selected.has(x.id)}
              onChange={(e) => toggle(x.id, e.target.checked)}
            />
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-danger">{t(error)}</p>}
      <div className="flex justify-end">
        <Button type="submit" icon="done_all" loading={saving} data-testid="roster-bulk-apply">{t('roster.apply')}</Button>
      </div>
    </form>
  );
}
