'use client';
import { PERMISSIONS, ROSTER_MAX_DAYS, addDays } from '@hrm/shared';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, QueryState, Select } from '@/components/ui';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { useHasPermission } from '@/features/auth/store';
import { useDepartments } from '@/features/org/hooks';
import { fill } from '@/features/settings/parameters/format';
import { shiftsApi } from '@/features/shifts/api';
import { RosterBulkForm } from '@/features/shifts/components/RosterBulkForm';
import { RosterGrid } from '@/features/shifts/components/RosterGrid';
import { mondayOf, todayLocal, weekDates } from '@/features/shifts/format';
import { useRoster, useShiftMutation, useShifts } from '@/features/shifts/hooks';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

/** Rotating roster (FR-ATT-17.3): a week of employees × days; `shift.manage` edits, `attendance.read_all` views. */
export default function RosterPage() {
  const t = useT();
  const canEdit = useHasPermission(PERMISSIONS.SHIFT_MANAGE);
  const [monday, setMonday] = useState(() => mondayOf(todayLocal()));
  const [departmentId, setDepartmentId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const dates = weekDates(monday);
  const roster = useRoster({ from: dates[0]!, to: dates[6]!, departmentId: departmentId || undefined });
  const shifts = useShifts();
  const departments = useDepartments();
  const apply = useShiftMutation(shiftsApi.applyRoster);

  const save = (cells: { employeeId: string; date: string }[], choice: string) =>
    apply.mutateAsync({ cells, choice }).then((r) => setNotice(fill(t('roster.saved'), { count: r.updated })));

  return (
    <RequirePermission permission={canEdit ? PERMISSIONS.SHIFT_MANAGE : PERMISSIONS.ATTENDANCE_READ_ALL}>
      <PageHeader title={t('roster.title')} description={t('roster.subtitle')} />
      <Card
        title={
          <span className="flex items-center gap-2">
            <Button size="sm" variant="ghost" icon="chevron_left" aria-label={t('roster.prevWeek')} onClick={() => setMonday((m) => addDays(m, -7))} />
            <span data-testid="roster-week" className="tabular-nums">{`${dates[0]} – ${dates[6]}`}</span>
            <Button size="sm" variant="ghost" icon="chevron_right" aria-label={t('roster.nextWeek')} onClick={() => setMonday((m) => addDays(m, 7))} />
            <Button size="sm" variant="secondary" onClick={() => setMonday(mondayOf(todayLocal()))}>{t('roster.thisWeek')}</Button>
          </span>
        }
        actions={
          <Select
            aria-label={t('roster.department')}
            className="w-48"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            placeholder={t('roster.allDepartments')}
            options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
        }
      >
        {notice && <p role="status" data-testid="roster-notice" className="mb-2 text-sm text-success">{notice}</p>}
        {apply.error ? <p role="alert" className="mb-2 text-sm text-danger">{t(apply.error instanceof ApiError ? apply.error.code : 'unknown')}</p> : null}
        <p className="mb-2 text-xs text-ink-muted">{t('roster.legend')}</p>
        <QueryState query={roster}>
          {(view) => (
            <RosterGrid
              roster={view}
              dates={dates}
              allShifts={shifts.data ?? []}
              shifts={(shifts.data ?? []).filter((s) => s.isActive)}
              disabled={apply.isPending}
              onChange={canEdit ? (employeeId, date, choice) => void save([{ employeeId, date }], choice).catch(() => undefined) : undefined}
            />
          )}
        </QueryState>
      </Card>
      {canEdit && roster.data && (
        <Card title={t('roster.bulk')} className="mt-4">
          <RosterBulkForm
            key={monday}
            employees={roster.data.employees}
            shifts={(shifts.data ?? []).filter((s) => s.isActive)}
            defaultFrom={dates[0]!}
            defaultTo={dates[6]!}
            maxDays={ROSTER_MAX_DAYS}
            saving={apply.isPending}
            onApply={save}
          />
        </Card>
      )}
    </RequirePermission>
  );
}
