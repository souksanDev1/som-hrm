import { monthGrid, type LeaveCalendarEntry, type LeaveCalendarResponse } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import LeaveCalendarScreen from '@/app/leave-calendar';
import { useAuthStore } from '@/features/auth/store';
import * as calendarApi from '@/features/leave-calendar/api';
import { LeaveDayList, LeaveMonthGrid } from '@/features/leave-calendar/LeaveCalendarViews';
import { usePrefsStore } from '@/lib/i18n';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, Redirect: () => null }));

const entry = (over: Partial<LeaveCalendarEntry> = {}): LeaveCalendarEntry => ({
  requestId: over.employeeName ?? 'r', employeeId: over.employeeName ?? 'e', employeeName: 'Anna A', departmentId: 'd1',
  startDate: '2030-12-04', endDate: '2030-12-04', halfDay: 'NONE', status: 'APPROVED', leaveType: null, ...over,
});

const data = (over: Partial<LeaveCalendarResponse> = {}): LeaveCalendarResponse => ({
  from: '2030-11-25', to: '2031-01-05', today: '2030-12-04',
  entries: [entry(), entry({ employeeName: 'Ben B', halfDay: 'PM' })],
  holidays: [], restDays: [],
  viewer: { canSeeTypes: false, canSeePending: false, canFilter: false, allDepartments: false },
  ...over,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}>{children}</QueryClientProvider>
);
const mockCalendar = (response = data()) => jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify(response), { status: 200 }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(calendarApi, 'deviceToday').mockReturnValue('2030-12-04');
  usePrefsStore.setState({ locale: 'en' });
  useAuthStore.setState({ accessToken: 'a', refreshToken: 'r', user: null });
});
afterEach(() => jest.restoreAllMocks());

describe('LeaveDayList (FR-LV-13.2/13.6/13.7)', () => {
  it('lists real names, full / half day and approved status; hidden types show "On leave"', () => {
    render(<LeaveDayList data={data()} date="2030-12-04" />);
    expect(screen.getByText('Off today')).toBeTruthy();
    expect(screen.getByText('Anna A')).toBeTruthy();
    expect(screen.getByText('Ben B')).toBeTruthy();
    expect(screen.getAllByText('On leave')).toHaveLength(2);
    expect(screen.getAllByTestId('lcal-entry-approved')).toHaveLength(2);
    expect(screen.getByText('Full day')).toBeTruthy();
    expect(screen.getByText('Afternoon (half day)')).toBeTruthy();
  });

  it.each(['en', 'lo'] as const)('shows type, pending, women-only holiday and rest-day notices in %s', (locale) => {
    usePrefsStore.setState({ locale });
    const d = data({
      entries: [entry({ status: 'PENDING', leaveType: { id: 't', nameLo: 'ລາປ່ວຍ', nameEn: 'Sick leave' } })],
      holidays: [{ date: '2030-12-04', nameLo: 'ວັນແມ່ຍິງ', nameEn: "Women's Day", womenOnly: true, nationality: null }],
      restDays: ['2030-12-04'],
      viewer: { canSeeTypes: true, canSeePending: true, canFilter: true, allDepartments: false },
    });
    render(<LeaveDayList data={d} date="2030-12-04" />);
    expect(screen.getByTestId('lcal-entry-PENDING')).toBeTruthy();
    expect(screen.getByText(locale === 'lo' ? 'ລາປ່ວຍ' : 'Sick leave')).toBeTruthy();
    expect(screen.getByTestId('lcal-holiday')).toHaveTextContent(locale === 'lo' ? /ສະເພາະພະນັກງານຍິງ/ : /women only/);
    expect(screen.getByTestId('lcal-rest')).toBeTruthy();
  });
});

describe('LeaveMonthGrid', () => {
  it('shows real initials, status rings and extra people count, deduplicating split-day requests', () => {
    const onSelect = jest.fn();
    const d = data({ entries: [
      entry(), entry({ employeeName: 'Ben B', status: 'PENDING' }),
      entry({ employeeName: 'Cara C' }), entry({ employeeName: 'Dan D' }),
      entry({ requestId: 'anna-pm', halfDay: 'PM' }),
    ] });
    render(<LeaveMonthGrid data={d} weeks={monthGrid('2030-12')} month="2030-12" selected="2030-12-04" onSelect={onSelect} />);
    const day = screen.getByTestId('lcal-month-day-2030-12-04');
    expect(within(day).getByText('AA')).toBeTruthy();
    expect(within(day).getByText('BB')).toBeTruthy();
    expect(within(day).queryByText('CC')).toBeNull();
    expect(within(day).getByTestId('lcal-month-more-2030-12-04')).toHaveTextContent('+2');
    expect(day.props.accessibilityLabel).toContain('Anna A, Approved');
    expect(day.props.accessibilityLabel).toContain('Ben B, Pending approval');
    expect(day.props.accessibilityLabel).toContain('+2 more');
    expect(screen.getByTestId('lcal-month-person-2030-12-04-e').props.className).toContain('border-success');
    expect(screen.getByTestId('lcal-month-person-2030-12-04-Ben B').props.className).toContain('border-dashed border-warning');
    expect(day).toHaveProp('accessibilityState', { selected: true });
    expect(screen.queryByTestId('lcal-month-count-2030-12-05')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(42);
    fireEvent.press(screen.getByTestId('lcal-month-day-2030-12-05'));
    expect(onSelect).toHaveBeenCalledWith('2030-12-05');
  });

  it('uses a name fallback without inventing a person when the response name is blank', () => {
    render(<LeaveMonthGrid data={data({ entries: [entry({ employeeName: ' ' })] })} weeks={monthGrid('2030-12')} month="2030-12" selected="2030-12-04" onSelect={jest.fn()} />);
    const day = screen.getByTestId('lcal-month-day-2030-12-04');
    expect(within(day).getByText('—')).toBeTruthy();
    expect(day.props.accessibilityLabel).toContain('Employee, Approved');
  });
});

describe('LeaveCalendarScreen', () => {
  it('defaults to month with the whole grid range, then keeps correct today and week ranges', async () => {
    const fetchSpy = mockCalendar();
    render(<LeaveCalendarScreen />, { wrapper });
    expect(await screen.findByTestId('lcal-month')).toBeTruthy();
    expect(screen.getByTestId('lcal-period')).toHaveTextContent('December 2030');
    expect(screen.getByTestId('lcal-view-month')).toHaveProp('accessibilityState', { selected: true });
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('/leave/calendar?from=2030-11-25&to=2031-01-05');
    expect(screen.queryByTestId('lcal-legend-pending')).toBeNull();

    fireEvent.press(screen.getByTestId('lcal-view-today'));
    expect(await screen.findByTestId('lcal-today')).toBeTruthy();
    await waitFor(() => expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('from=2030-12-04&to=2030-12-04'))).toBe(true));
    fireEvent.press(screen.getByTestId('lcal-view-week'));
    expect(await screen.findByTestId('lcal-week')).toBeTruthy();
    await waitFor(() => expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('from=2030-12-02&to=2030-12-08'))).toBe(true));
    expect(screen.getByTestId('lcal-week-day-2030-12-02')).toBeTruthy();
    expect(screen.getByTestId('lcal-week-day-2030-12-08')).toBeTruthy();
    fireEvent.press(screen.getByTestId('lcal-view-month'));
    expect(screen.getByTestId('lcal-month')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('navigates month boundaries and returns to the API today, not the device date', async () => {
    const fetchSpy = mockCalendar(data({ today: '2031-02-05' }));
    render(<LeaveCalendarScreen />, { wrapper });
    await screen.findByTestId('lcal-month');
    fireEvent.press(screen.getByTestId('lcal-next'));
    expect(screen.getByTestId('lcal-period')).toHaveTextContent('January 2031');
    await waitFor(() => expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('from=2030-12-30&to=2031-02-02'))).toBe(true));
    fireEvent.press(screen.getByTestId('lcal-prev'));
    expect(screen.getByTestId('lcal-period')).toHaveTextContent('December 2030');
    fireEvent.press(screen.getByTestId('lcal-prev'));
    expect(screen.getByTestId('lcal-period')).toHaveTextContent('November 2030');
    await waitFor(() => expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('from=2030-10-28&to=2030-12-01'))).toBe(true));
    fireEvent.press(screen.getByTestId('lcal-go-today'));
    expect(screen.getByTestId('lcal-period')).toHaveTextContent('February 2031');
    expect(screen.getByTestId('lcal-month-day-2031-02-05')).toHaveProp('accessibilityState', { selected: true });
    await waitFor(() => expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('from=2031-01-27&to=2031-03-02'))).toBe(true));
  });

  it.each([
    ['today', 'from=2030-12-05&to=2030-12-05', 'from=2030-12-03&to=2030-12-03'],
    ['week', 'from=2030-12-09&to=2030-12-15', 'from=2030-11-25&to=2030-12-01'],
  ])('keeps previous/next navigation for %s', async (view, next, previous) => {
    const fetchSpy = mockCalendar();
    render(<LeaveCalendarScreen />, { wrapper });
    await screen.findByTestId('lcal-month');
    fireEvent.press(screen.getByTestId(`lcal-view-${view}`));
    fireEvent.press(screen.getByTestId('lcal-next'));
    await waitFor(() => expect(fetchSpy.mock.calls.some(([url]) => String(url).includes(next))).toBe(true));
    fireEvent.press(screen.getByTestId('lcal-prev'));
    fireEvent.press(screen.getByTestId('lcal-prev'));
    await waitFor(() => expect(fetchSpy.mock.calls.some(([url]) => String(url).includes(previous))).toBe(true));
  });

  it('shows the selected day’s names, statuses, half days and notices without exposing hidden types', async () => {
    const fetchSpy = mockCalendar(data({
      entries: [entry(), entry({ employeeName: 'Kham K', startDate: '2030-12-05', endDate: '2030-12-05', status: 'PENDING', halfDay: 'AM' })],
      holidays: [{ date: '2030-12-05', nameLo: 'ວັນພັກ', nameEn: 'Holiday name', womenOnly: false, nationality: null }],
      restDays: ['2030-12-05'],
      viewer: { canSeeTypes: false, canSeePending: true, canFilter: false, allDepartments: false },
    }));
    render(<LeaveCalendarScreen />, { wrapper });
    await screen.findByTestId('lcal-month');
    const calls = fetchSpy.mock.calls.length;
    fireEvent.press(screen.getByTestId('lcal-month-day-2030-12-05'));
    const selected = within(screen.getByTestId('lcal-day-list'));
    expect(selected.getByText('Kham K')).toBeTruthy();
    expect(selected.queryByText('Anna A')).toBeNull();
    expect(selected.getByText('Morning (half day)')).toBeTruthy();
    expect(selected.getByText('On leave')).toBeTruthy();
    expect(selected.getByTestId('lcal-entry-pending')).toBeTruthy();
    expect(selected.getByTestId('lcal-holiday')).toHaveTextContent(/Holiday name/);
    expect(selected.getByTestId('lcal-rest')).toBeTruthy();
    expect(screen.getByTestId('lcal-month-day-2030-12-05')).toHaveProp('accessibilityState', { selected: true });
    expect(fetchSpy.mock.calls).toHaveLength(calls);
    fireEvent.press(screen.getByTestId('lcal-month-day-2030-12-06'));
    expect(within(screen.getByTestId('lcal-day-list')).getByTestId('lcal-empty')).toBeTruthy();
    fireEvent.press(screen.getByTestId('lcal-go-today'));
    expect(within(screen.getByTestId('lcal-day-list')).getByText('Anna A')).toBeTruthy();
  });
});
