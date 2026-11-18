import type { LeaveCalendarEntry, LeaveCalendarResponse } from '@hrm/shared';
import { monthGrid, weekDates } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { visibleNav } from '@/components/layout/nav';
import { LeaveCalendarGrid } from '@/features/leave-calendar/components/LeaveCalendarGrid';
import { LeaveCalendarScreen } from '@/features/leave-calendar/components/LeaveCalendarScreen';
import { LeaveTodayList } from '@/features/leave-calendar/components/LeaveTodayList';
import { usePrefsStore } from '@/lib/i18n';

const api = vi.hoisted(() => ({ calendar: vi.fn(), types: vi.fn() }));
vi.mock('@/features/leave-calendar/api', () => ({ leaveCalendarApi: api }));
const orgApi = vi.hoisted(() => ({ departments: vi.fn() }));
vi.mock('@/features/org/api', () => ({ orgApi }));

const entry = (over: Partial<LeaveCalendarEntry>): LeaveCalendarEntry => ({
  requestId: over.employeeName ?? 'r',
  employeeId: 'e',
  employeeName: 'Somchai P',
  departmentId: 'd1',
  startDate: '2030-12-04',
  endDate: '2030-12-04',
  halfDay: 'NONE',
  status: 'APPROVED',
  leaveType: null,
  ...over,
});

const base: LeaveCalendarResponse = {
  from: '2030-12-02',
  to: '2030-12-08',
  today: '2030-12-04',
  entries: [
    entry({ employeeName: 'Anna A', startDate: '2030-12-03', endDate: '2030-12-05' }),
    entry({ employeeName: 'Ben B', halfDay: 'AM' }),
  ],
  holidays: [{ date: '2030-12-02', nameLo: 'ວັນຊາດ', nameEn: 'National Day', womenOnly: false, nationality: null }],
  restDays: ['2030-12-08'],
  viewer: { canSeeTypes: false, canSeePending: false, canFilter: false, allDepartments: false },
};

beforeEach(() => {
  usePrefsStore.setState({ locale: 'en' });
  api.calendar.mockReset();
  api.types.mockReset();
  orgApi.departments.mockResolvedValue([
    { id: 'd1', name: 'Sales' },
    { id: 'd2', name: 'Ops' },
  ]);
});

describe('LeaveTodayList (FR-LV-13.2)', () => {
  it('lists who is off today with full / half day and hides the type for regular staff', () => {
    render(<LeaveTodayList data={base} date="2030-12-04" />);
    expect(screen.getByText('Off today')).toBeInTheDocument();
    const rows = screen.getAllByTestId('lcal-today-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Anna A');
    expect(rows[0]).toHaveTextContent('Full day');
    expect(rows[0]).toHaveTextContent('On leave');
    expect(rows[1]).toHaveTextContent('Morning (half day)');
  });

  it('shows the leave type and pending status when the API sends them, plus holiday / rest-day notices', () => {
    const data = {
      ...base,
      entries: [entry({ status: 'PENDING', leaveType: { id: 't', nameLo: 'ລາປ່ວຍ', nameEn: 'Sick leave' } })],
    };
    render(<LeaveTodayList data={data} date="2030-12-04" />);
    const chip = screen.getByTestId('lcal-entry');
    expect(chip).toHaveAttribute('data-status', 'PENDING');
    expect(chip).toHaveTextContent('Sick leave');
    expect(screen.getByTestId('lcal-entry-pending')).toBeInTheDocument();
  });

  it('marks holidays (women-only flagged), rest days and an empty day', () => {
    const data = { ...base, holidays: [{ date: '2030-03-08', nameLo: 'ວັນແມ່ຍິງ', nameEn: "Women's Day", womenOnly: true, nationality: null }], restDays: ['2030-03-08'] };
    render(<LeaveTodayList data={data} date="2030-03-08" />);
    expect(screen.getByTestId('lcal-today-holiday')).toHaveTextContent("Women's Day — Holiday (women only)");
    expect(screen.getByTestId('lcal-today-rest')).toBeInTheDocument();
    expect(screen.getByTestId('lcal-today-empty')).toHaveTextContent('Nobody is off');
  });
});

describe('LeaveCalendarGrid (FR-LV-13.3/13.7/13.8)', () => {
  it('week view: one cell per day, multi-day leave on each day, holiday and rest day shading', () => {
    render(<LeaveCalendarGrid data={base} weeks={[weekDates('2030-12-04')]} />);
    const days = screen.getAllByTestId('lcal-day');
    expect(days.map((d) => d.dataset.date)).toEqual(['2030-12-02', '2030-12-03', '2030-12-04', '2030-12-05', '2030-12-06', '2030-12-07', '2030-12-08']);
    expect(days.map((d) => d.dataset.count)).toEqual(['0', '1', '2', '1', '0', '0', '0']);
    expect(days[0]).toHaveAttribute('data-holiday', 'true');
    expect(within(days[0]!).getByTestId('lcal-holiday')).toHaveTextContent('National Day');
    expect(days[6]).toHaveAttribute('data-rest', 'true');
    expect(within(days[2]!).getAllByTestId('lcal-entry').map((e) => e.dataset.half)).toEqual(['NONE', 'AM']);
  });

  it('month view: whole weeks, "+N more" past the cell limit, and a click opens the day', async () => {
    const many = { ...base, entries: ['A', 'B', 'C', 'D', 'E'].map((n) => entry({ employeeName: `${n} X` })) };
    const onSelect = vi.fn();
    render(<LeaveCalendarGrid data={many} weeks={monthGrid('2030-12')} month="2030-12" maxPerCell={3} onSelectDate={onSelect} />);
    expect(screen.getAllByTestId('lcal-day')).toHaveLength(42);
    const dec4 = screen.getAllByTestId('lcal-day').find((d) => d.dataset.date === '2030-12-04')!;
    expect(within(dec4).getAllByTestId('lcal-entry')).toHaveLength(3);
    expect(within(dec4).getByTestId('lcal-more')).toHaveTextContent('+2 more');
    await userEvent.click(dec4);
    expect(onSelect).toHaveBeenCalledWith('2030-12-04');
  });
});

const renderScreen = (props: Parameters<typeof LeaveCalendarScreen>[0] = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LeaveCalendarScreen initialDate="2030-12-04" {...props} />
    </QueryClientProvider>,
  );

describe('LeaveCalendarScreen', () => {
  it('starts on today, switches to week / month with the right ranges, and hides filters for regular staff', async () => {
    api.calendar.mockImplementation(async (q: { from: string; to: string }) => ({ ...base, from: q.from, to: q.to }));
    renderScreen();
    expect(await screen.findByTestId('lcal-today')).toBeInTheDocument();
    expect(api.calendar).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2030-12-04', to: '2030-12-04' }));
    expect(screen.queryByTestId('lcal-filters')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lcal-legend-pending')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('lcal-view-week'));
    expect(await screen.findByTestId('lcal-week')).toBeInTheDocument();
    expect(api.calendar).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2030-12-02', to: '2030-12-08' }));

    await userEvent.click(screen.getByTestId('lcal-next'));
    expect(api.calendar).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2030-12-09', to: '2030-12-15' }));

    await userEvent.click(screen.getByTestId('lcal-view-month'));
    expect(await screen.findByTestId('lcal-month')).toBeInTheDocument();
    expect(api.calendar).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2030-11-25', to: '2031-01-05' }));
  });

  it('managers / HR get department and leave-type filters sent to the API, and the pending legend', async () => {
    api.calendar.mockResolvedValue({ ...base, viewer: { canSeeTypes: true, canSeePending: true, canFilter: true, allDepartments: true } });
    api.types.mockResolvedValue([{ id: 't1', nameLo: 'ລາພັກ', nameEn: 'Annual leave' }]);
    renderScreen();
    const dept = await screen.findByTestId('lcal-filter-department');
    expect(screen.getByTestId('lcal-legend-pending')).toBeInTheDocument();
    expect(screen.getByTestId('lcal-scope')).toHaveTextContent('every department');
    await screen.findByRole('option', { name: 'Ops' });
    await userEvent.selectOptions(dept, 'd2');
    expect(api.calendar).toHaveBeenLastCalledWith(expect.objectContaining({ departmentId: 'd2', leaveTypeId: undefined }));
    await screen.findByRole('option', { name: 'Annual leave' });
    await userEvent.selectOptions(screen.getByTestId('lcal-filter-type'), 't1');
    expect(api.calendar).toHaveBeenLastCalledWith(expect.objectContaining({ departmentId: 'd2', leaveTypeId: 't1' }));
  });
});

describe('nav', () => {
  it('shows the leave calendar to every signed-in user', () => {
    expect(visibleNav([]).map((i) => i.href)).toContain('/leave/calendar');
  });
});
