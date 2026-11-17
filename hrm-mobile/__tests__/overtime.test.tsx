import type { MyOvertime, OvertimePreview, OvertimeRequestView } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import OvertimeScreen from '@/app/overtime';
import NewOvertimeScreen from '@/app/overtime/new';
import { useAuthStore } from '@/features/auth/store';
import { shiftMonth } from '@/features/overtime/api';
import { OvertimeRequestForm, previewInputOf } from '@/features/overtime/OvertimeViews';
import { ApiError } from '@/lib/api';
import { usePrefsStore } from '@/lib/i18n';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: (...a: unknown[]) => mockBack(...a), push: (...a: unknown[]) => mockPush(...a), replace: jest.fn() },
  Redirect: () => null,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })}>{children}</QueryClientProvider>
);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const preview = (over: Partial<OvertimePreview> = {}): OvertimePreview => ({
  start: '', end: '', workdayDayMinutes: 30, workdayNightMinutes: 60, holidayDayMinutes: 0, holidayNightMinutes: 0, minutes: 90,
  day: { total: 90, cap: 180, exceeded: false, warn: false }, month: { total: 90, cap: 2700, exceeded: false, warn: false }, warnPercent: 80, ...over,
});

const request = (over: Partial<OvertimeRequestView> = {}): OvertimeRequestView => ({
  id: 'ot1', employeeId: 'e3', employeeCode: 'E003', employeeName: 'Phet', kind: 'PRE', workDate: '2026-11-20', plannedStart: '', plannedEnd: '',
  plannedStartTime: '21:30', plannedEndTime: '23:00', actualStart: null, actualEnd: null, actualStartTime: null, actualEndTime: null,
  reason: 'Inventory', minutes: 90, workdayDayMinutes: 30, workdayNightMinutes: 60, holidayDayMinutes: 0, holidayNightMinutes: 0,
  status: 'APPROVED', decidedAt: null, createdAt: '', approvalRequestId: 'ap1', ...over,
});

beforeEach(() => {
  mockBack.mockReset();
  mockPush.mockReset();
  usePrefsStore.setState({ locale: 'lo' });
  useAuthStore.setState({ accessToken: 'a', refreshToken: 'r', user: null });
});
afterEach(() => jest.restoreAllMocks());

describe('shiftMonth', () => {
  it('moves across year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('previewInputOf', () => {
  it('only previews a complete, valid period', () => {
    expect(previewInputOf({ kind: 'PRE', workDate: '2026-11-20', start: '21:3', end: '23:00' })).toBeNull();
    expect(previewInputOf({ kind: 'PRE', workDate: '2026-13-20', start: '21:30', end: '23:00' })).toBeNull();
    expect(previewInputOf({ kind: 'POST', workDate: '2026-11-20', start: '21:30', end: '23:00' })).toEqual({ kind: 'POST', workDate: '2026-11-20', start: '21:30', end: '23:00' });
  });
});

describe('OvertimeScreen (FR-ATT-23)', () => {
  it('shows approved hours by category and the requests', async () => {
    const mine: MyOvertime = {
      month: '2026-11',
      items: [request()],
      approved: { workdayDayMinutes: 30, workdayNightMinutes: 60, holidayDayMinutes: 0, holidayNightMinutes: 0, totalMinutes: 90 },
      pendingMinutes: 120,
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => json(mine));
    render(<OvertimeScreen />, { wrapper });
    expect(await screen.findByTestId('ot-approved-total')).toHaveTextContent('1:30');
    expect(screen.getByTestId('ot-approved-workdayNightMinutes')).toHaveTextContent('1:00');
    expect(screen.getByTestId('ot-pending')).toHaveTextContent('ລໍຖ້າອະນຸມັດ 2:00 ຊມ');
    expect(screen.getByTestId('ot-item')).toHaveTextContent(/ແຜນ 21:30–23:00/);
    expect(String(fetchSpy.mock.calls[0]![0])).toMatch(/\/overtime\/me\?month=\d{4}-\d{2}$/);
    fireEvent.press(screen.getByTestId('ot-new'));
    expect(mockPush).toHaveBeenCalledWith('/overtime/new');
  });
});

describe('NewOvertimeScreen (FR-ATT-20..22)', () => {
  it('previews the split from the API and submits the request', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) =>
      String(url).endsWith('/overtime/preview') ? json(preview({ day: { total: 150, cap: 180, exceeded: false, warn: true } })) : json(request(), 201),
    );
    render(<NewOvertimeScreen />, { wrapper });
    fireEvent.changeText(screen.getByTestId('ot-workDate'), '2026-11-20');
    fireEvent.changeText(screen.getByTestId('ot-start'), '21:30');
    fireEvent.changeText(screen.getByTestId('ot-end'), '23:00');
    expect(await screen.findByTestId('ot-preview-split-total')).toHaveTextContent('1:30');
    expect(screen.getByTestId('ot-cap-day-warn')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('ot-reason'), 'Inventory');
    fireEvent.press(screen.getByTestId('ot-submit'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const post = fetchSpy.mock.calls.find((c) => String(c[0]).endsWith('/overtime') && (c[1] as RequestInit).method === 'POST');
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ kind: 'PRE', workDate: '2026-11-20', start: '21:30', end: '23:00', reason: 'Inventory' });
  });
});

describe('OvertimeRequestForm', () => {
  it('blocks submission over the cap and shows API errors', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new ApiError(409, 'ot_overlaps_request', 'x'));
    const { rerender } = render(
      <OvertimeRequestForm
        today="2026-11-20"
        preview={{ data: preview({ month: { total: 2800, cap: 2700, exceeded: true, warn: true } }), error: null, isFetching: false }}
        onPeriodChange={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByTestId('ot-cap-month-exceeded')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('ot-start'), '21:30');
    fireEvent.changeText(screen.getByTestId('ot-end'), '23:00');
    fireEvent.changeText(screen.getByTestId('ot-reason'), 'x');
    fireEvent.press(screen.getByTestId('ot-submit'));
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(<OvertimeRequestForm today="2026-11-20" preview={{ data: preview(), error: null, isFetching: false }} onPeriodChange={jest.fn()} onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByTestId('ot-start'), '21:30');
    fireEvent.changeText(screen.getByTestId('ot-end'), '23:00');
    fireEvent.changeText(screen.getByTestId('ot-reason'), 'x');
    fireEvent.press(screen.getByTestId('ot-submit'));
    expect(await screen.findByTestId('ot-form-error')).toHaveTextContent('ມີຄຳຂໍໂອທີໃນຊ່ວງເວລານີ້ແລ້ວ');
  });

  it('shows a preview error such as OT inside normal hours', () => {
    render(
      <OvertimeRequestForm
        today="2026-11-20"
        preview={{ data: undefined, error: new ApiError(409, 'ot_overlaps_shift', 'x'), isFetching: false }}
        onPeriodChange={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByTestId('ot-preview-error')).toHaveTextContent('ເວລາໂອທີຕ້ອງຢູ່ນອກເວລາເຮັດວຽກປົກກະຕິ');
  });
});
