'use client';
import { leaveCalendarRange, monthGrid, shiftLeaveCalendarAnchor, weekDates, type LeaveCalendarView } from '@hrm/shared';
import { useMemo, useState } from 'react';
import { Card, QueryState } from '@/components/ui';
import { useDepartments } from '@/features/org/hooks';
import { usePrefsStore, useT } from '@/lib/i18n';
import { useLeaveCalendar, useLeaveTypes } from '../hooks';
import { formatLongDate, formatMonth, formatRange, localName } from '../format';
import { LeaveCalendarFilters } from './LeaveCalendarFilters';
import { LeaveCalendarGrid } from './LeaveCalendarGrid';
import { LeaveCalendarLegend } from './LeaveCalendarLegend';
import { LeaveCalendarToolbar } from './LeaveCalendarToolbar';
import { LeaveTodayList } from './LeaveTodayList';

/** Today in the browser's zone (the workspace's for Lao users); replaced by the API's `today` once loaded. */
const browserToday = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The leave calendar page body (FR-LV-13): view state, navigation, filters and the selected view. */
export function LeaveCalendarScreen({ initialDate = browserToday(), initialView = 'today' }: { initialDate?: string; initialView?: LeaveCalendarView }) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const [view, setView] = useState<LeaveCalendarView>(initialView);
  const [anchor, setAnchor] = useState(initialDate);
  const [filters, setFilters] = useState({ departmentId: '', leaveTypeId: '' });

  const range = leaveCalendarRange(view, anchor);
  const query = useLeaveCalendar({ ...range, departmentId: filters.departmentId || undefined, leaveTypeId: filters.leaveTypeId || undefined });
  const viewer = query.data?.viewer;
  const canFilter = !!viewer?.canFilter;
  const departments = useDepartments();
  const types = useLeaveTypes(canFilter);

  const weeks = useMemo(() => (view === 'month' ? monthGrid(anchor.slice(0, 7)) : [weekDates(anchor)]), [view, anchor]);
  const periodLabel = view === 'today' ? formatLongDate(anchor, locale) : view === 'week' ? formatRange(range.from, range.to, locale) : formatMonth(anchor, locale);
  const scopeKey = viewer?.allDepartments ? 'lcal.scope.all' : canFilter ? 'lcal.scope.team' : 'lcal.scope.department';

  return (
    <Card className="flex flex-col gap-4" data-testid="lcal-screen">
      <LeaveCalendarToolbar
        view={view}
        periodLabel={periodLabel}
        onViewChange={setView}
        onPrev={() => setAnchor((a) => shiftLeaveCalendarAnchor(view, a, -1))}
        onNext={() => setAnchor((a) => shiftLeaveCalendarAnchor(view, a, 1))}
        onToday={() => setAnchor(query.data?.today ?? browserToday())}
      />
      {canFilter && (
        <LeaveCalendarFilters
          departments={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          leaveTypes={(types.data ?? []).map((lt) => ({ value: lt.id, label: localName(lt, locale) }))}
          departmentId={filters.departmentId}
          leaveTypeId={filters.leaveTypeId}
          onChange={setFilters}
        />
      )}
      {viewer && (
        <p data-testid="lcal-scope" className="text-xs text-ink-muted">
          {t(scopeKey)}
        </p>
      )}
      <QueryState query={query}>
        {(data) => (
          <>
            {view === 'today' ? (
              <LeaveTodayList data={data} date={anchor} />
            ) : (
              <LeaveCalendarGrid
                data={data}
                weeks={weeks}
                month={view === 'month' ? anchor.slice(0, 7) : undefined}
                maxPerCell={view === 'month' ? 3 : undefined}
                onSelectDate={(date) => {
                  setAnchor(date);
                  setView('today');
                }}
              />
            )}
            <LeaveCalendarLegend viewer={data.viewer} />
          </>
        )}
      </QueryState>
    </Card>
  );
}
