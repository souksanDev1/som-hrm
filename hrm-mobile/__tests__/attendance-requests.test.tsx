import type { Correction, DeviceChangeRequest } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import ChangeDeviceScreen from '@/app/attendance/change-device';
import CorrectionScreen from '@/app/attendance/correction';
import { ChangeDeviceForm, CorrectionForm, CorrectionList } from '@/features/attendance-requests/AttendanceRequestViews';
import { DEVICE_ID_KEY, getDeviceInfo, resetDeviceInfoForTests } from '@/features/checkin/device';
import { useAuthStore } from '@/features/auth/store';
import { ApiError } from '@/lib/api';
import { usePrefsStore } from '@/lib/i18n';
import * as SecureStore from 'expo-secure-store';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, Redirect: () => null }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })}>{children}</QueryClientProvider>
);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const correction: Correction = {
  id: 'c1',
  employee: { id: 'e3', employeeCode: 'E003', name: 'Kham' },
  workDate: '2026-11-16',
  checkIn: { original: '2026-11-16 08:30', requested: '2026-11-16 08:00' },
  checkOut: { original: null, requested: null },
  reason: 'Queue at the gate',
  attachment: null,
  status: 'PENDING',
  createdAt: '2026-11-16T10:00:00.000Z',
  decidedAt: null,
  approvalRequestId: 'a1',
};

beforeEach(() => {
  usePrefsStore.setState({ locale: 'lo' });
  useAuthStore.setState({ accessToken: 'a', refreshToken: 'r', user: null });
});
afterEach(() => jest.restoreAllMocks());

describe('CorrectionForm (FR-ATT-19)', () => {
  it('needs a time and a reason, then submits only the filled times', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<CorrectionForm initialDate="2026-11-16" onSubmit={onSubmit} />);
    fireEvent.press(screen.getByTestId('correction-submit'));
    expect(screen.getByText('ໃສ່ເວລາເຂົ້າ ຫຼື ເວລາອອກຢ່າງໜ້ອຍ 1 ອັນ')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('correction-in'), '8:00');
    fireEvent.press(screen.getByTestId('correction-submit'));
    expect(screen.getByText('ເວລາບໍ່ຖືກຕ້ອງ (HH:mm)')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('correction-in'), '08:00');
    fireEvent.changeText(screen.getByTestId('correction-reason'), ' Forgot ');
    fireEvent.press(screen.getByTestId('correction-submit'));
    expect(await screen.findByTestId('correction-sent')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({ workDate: '2026-11-16', requestedCheckIn: '08:00', requestedCheckOut: undefined, reason: 'Forgot' });
  });

  it('shows an API error under its field', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new ApiError(400, 'correction_future_date', 'x', { field: 'workDate' }));
    render(<CorrectionForm initialDate="2099-01-01" onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByTestId('correction-out'), '17:00');
    fireEvent.changeText(screen.getByTestId('correction-reason'), 'x');
    fireEvent.press(screen.getByTestId('correction-submit'));
    expect(await screen.findByText('ແກ້ໄຂໄດ້ສະເພາະມື້ທີ່ຜ່ານມາ ຫຼື ມື້ນີ້')).toBeTruthy();
  });

  it('lists original vs requested times', () => {
    render(<CorrectionList items={[correction]} />);
    expect(screen.getByText('ເວລາເຂົ້າວຽກ: 2026-11-16 08:30 → 2026-11-16 08:00')).toBeTruthy();
    expect(screen.getByText('ລໍຖ້າອະນຸມັດ')).toBeTruthy();
  });
});

describe('CorrectionScreen', () => {
  it('posts the request and shows the own list', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url, init) =>
      (init as RequestInit | undefined)?.method === 'POST' ? json(correction, 201) : json([correction]),
    );
    render(<CorrectionScreen />, { wrapper });
    expect(await screen.findByTestId('correction-item')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('correction-date'), '2026-11-16');
    fireEvent.changeText(screen.getByTestId('correction-in'), '08:00');
    fireEvent.changeText(screen.getByTestId('correction-reason'), 'Forgot');
    fireEvent.press(screen.getByTestId('correction-submit'));
    expect(await screen.findByTestId('correction-sent')).toBeTruthy();
    const post = fetchSpy.mock.calls.find((c) => String(c[0]).endsWith('/attendance/corrections') && (c[1] as RequestInit).method === 'POST');
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ workDate: '2026-11-16', requestedCheckIn: '08:00', reason: 'Forgot' });
  });
});

describe('device change (FR-ATT-11.2)', () => {
  it('keeps one stable install id in secure storage', async () => {
    resetDeviceInfoForTests();
    const first = (await getDeviceInfo())!;
    resetDeviceInfoForTests();
    const second = (await getDeviceInfo())!;
    expect(first.deviceId).toBe(second.deviceId);
    expect(await SecureStore.getItemAsync(DEVICE_ID_KEY)).toBe(first.deviceId);
    expect(['IOS', 'ANDROID']).toContain(first.platform);
  });

  it('requires a reason and sends this device', async () => {
    const onSubmit = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ApiError(409, 'device_change_pending', 'x'));
    render(<ChangeDeviceForm device={{ deviceId: 'dev-1', platform: 'ANDROID', model: 'Huawei Y7' }} onSubmit={onSubmit} />);
    expect(screen.getByText('Huawei Y7')).toBeTruthy();
    fireEvent.press(screen.getByTestId('device-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('device-reason'), 'Lost phone');
    fireEvent.press(screen.getByTestId('device-submit'));
    expect(await screen.findByTestId('device-sent')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({ deviceId: 'dev-1', platform: 'ANDROID', model: 'Huawei Y7', reason: 'Lost phone' });
    fireEvent.changeText(screen.getByTestId('device-reason'), 'again');
    fireEvent.press(screen.getByTestId('device-submit'));
    expect(await screen.findByText('ມີຄຳຂໍປ່ຽນເຄື່ອງທີ່ລໍຖ້າອະນຸມັດຢູ່ແລ້ວ')).toBeTruthy();
  });

  it('shows previous requests on the screen', async () => {
    const request: DeviceChangeRequest = {
      id: 'r1', deviceId: 'dev-1', platform: 'ANDROID', model: 'Huawei Y7', reason: 'Lost phone', status: 'APPROVED', createdAt: '2026-11-10T00:00:00.000Z', decidedAt: null, approvalRequestId: 'a1',
    };
    jest.spyOn(global, 'fetch').mockImplementation(async () => json([request]));
    render(<ChangeDeviceScreen />, { wrapper });
    expect(await screen.findByTestId('device-request')).toBeTruthy();
    expect(screen.getByText('ອະນຸມັດແລ້ວ')).toBeTruthy();
    expect(await screen.findByTestId('device-submit')).toBeTruthy();
  });
});
