import type { LeaveCalendarEntry, LeaveCalendarResponse } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import LeaveCalendarScreen from '@/app/leave-calendar';
import { useAuthStore } from '@/features/auth/store';
import { deviceToday } from '@/features/leave-calendar/api';
import { LeaveDayList, LeaveMonthGrid } from '@/features/leave-calendar/LeaveCalendarViews';
import { usePrefsStore } from '@/lib/i18n';
import { monthGrid } from '@hrm/shared';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, Redirect: () => null }));

const entry = (over: Partial<LeaveCalendarEntry>): LeaveCalendarEntry => ({
  requestId: over.employeeName ?? 'r', employeeId: 'e', employeeName: 'Anna A', departmentId: 'd1',
  startDate: '2030-12-04', endDate: '2030-12-04', halfDay: 'NONE', status: 'APPROVED', leaveType: null, ...over,
});

const data = (over: Partial<LeaveCalendarResponse> = {}): LeaveCalendarResponse => ({
  from: '2030-12-04', to: '2030-12-04', today: '2030-12-04',
  entries: [entry({}), entry({ employeeName: 'Ben B', halfDay: 'PM' })],
  holidays: [], restDays: [],
  viewer: { canSeeTypes: false, canSeePending: false, canFilter: false, allDepartments: false },
  ...over,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}>{children}</QueryClientProvider>
);

beforeEach(() => {
  usePrefsStore.setState({ locale: 'en' });
  useAuthStore.setState({ accessToken: 'a', refreshToken: 'r', user: null });
});
afterEach(() => jest.restoreAllMocks());

describe('LeaveDayList (FR-LV-13.2/13.6/13.7)', () => {
  it('lists who is off with full / half day; type hidden shows "On leave"', () => {
    render(<LeaveDayList data={data()} date="2030-12-04" />);
    expect(screen.getByText('Off today')).toBeTruthy();
    expect(screen.getAllByText('On leave')).toHaveLength(2);
    expect(screen.getByText('Full day')).toBeTruthy();
    expect(screen.getByText('Afternoon (half day)')).toBeTruthy();
  });

  it('shows type + pending in amber for managers, and holiday / rest-day notices', () => {
    const d = data({
      entries: [entry({ status: 'PENDING', leaveType: { id: 't', nameLo: 'ລາປ່ວຍ', nameEn: 'Sick leave' } })],
      holidays: [{ date: '2030-12-04', nameLo: 'ວັນແມ່ຍິງ', nameEn: "Women's Day", womenOnly: true, nationality: null }],
      restDays: ['2030-12-04'],
      viewer: { canSeeTypes: true, canSeePending: true, canFilter: true, allDepartments: false },
    });
    render(<LeaveDayList data={d} date="2030-12-04" />);
    expect(screen.getByTestId('lcal-entry-PENDING')).toBeTruthy();
    expect(screen.getByText('Sick leave')).toBeTruthy();
    expect(screen.getByTestId('lcal-holiday').props.children).toContain('women only');
    expect(screen.getByTestId('lcal-rest')).toBeTruthy();
  });
});

describe('LeaveMonthGrid', () => {
  it('shows a count per day and selects a day on tap', () => {
    const onSelect = jest.fn();
    render(<LeaveMonthGrid data={data()} weeks={monthGrid('2030-12')} month="2030-12" selected="2030-12-04" onSelect={onSelect} />);
    expect(within(screen.getByTestId('lcal-month-day-2030-12-04')).getByText('2')).toBeTruthy();
    expect(screen.queryByTestId('lcal-month-count-2030-12-05')).toBeNull();
    fireEvent.press(screen.getByTestId('lcal-month-day-2030-12-05'));
    expect(onSelect).toHaveBeenCalledWith('2030-12-05');
  });
});

describe('LeaveCalendarScreen', () => {
  it('loads today, then switches to week and month with the right API ranges', async () => {
    const today = deviceToday();
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify(data({ today })), { status: 200 }));
    render(<LeaveCalendarScreen />, { wrapper });
    expect(await screen.findByTestId('lcal-today')).toBeTruthy();
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(`/leave/calendar?from=${today}&to=${today}`);
    expect(screen.queryByTestId('lcal-legend-pending')).toBeNull();

    fireEvent.press(screen.getByTestId('lcal-view-week'));
    expect(await screen.findByTestId('lcal-week')).toBeTruthy();
    fireEvent.press(screen.getByTestId('lcal-view-month'));
    expect(await screen.findByTestId('lcal-month')).toBeTruthy();
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.length).toBeGreaterThanOrEqual(3);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
