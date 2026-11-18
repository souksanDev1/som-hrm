import type { LeavePreview, LeaveRequest, LeaveType } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import LeaveScreen from '@/app/leave';
import LeaveDetailScreen from '@/app/leave/[id]';
import NewLeaveScreen from '@/app/leave/new';
import { useAuthStore } from '@/features/auth/store';
import { LeaveDetail, LeaveRequestForm } from '@/features/leave/LeaveViews';
import { ApiError } from '@/lib/api';
import { usePrefsStore } from '@/lib/i18n';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: (...a: unknown[]) => mockBack(...a), push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), canGoBack: () => true },
  Redirect: () => null,
  useLocalSearchParams: () => ({ id: 'lr1' }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })}>{children}</QueryClientProvider>
);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const urlOf = (input: unknown) => String(input instanceof Request ? input.url : input);

const leaveType = (over: Partial<LeaveType> = {}): LeaveType => ({
  id: 'annual', code: 'ANNUAL', category: 'ANNUAL', nameLo: 'ລາພັກປະຈຳປີ', nameEn: 'Annual leave', paid: true, requiresAttachment: false, allowHalfDay: true,
  gender: null, isActive: true, countingMethod: 'WORKING_DAYS', quotaPeriod: 'YEARLY', isCustom: false, sortOrder: 1,
  policy: { daysPerYear: 15, hazardousDays: null, multipleBirthDays: null, minServiceDays: 0, minServicePayTypes: [] }, legalMin: null, ...over,
});
const TYPES = [leaveType(), leaveType({ id: 'sick', code: 'SICK', category: 'SICK', nameLo: 'ລາປ່ວຍ', nameEn: 'Sick', requiresAttachment: true })];
const preview = (over: Partial<LeavePreview> = {}): LeavePreview => ({
  days: 2, byYear: { 2030: 2 }, balanceByYear: { 2030: 13 }, quota: null, errors: [], certificateRequired: false, certificateDueDate: null, needsDelegate: false, ...over,
});
const request = (over: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: 'lr1', employeeId: 'e1', employeeCode: 'E001', employeeName: 'Phet', leaveType: { id: 'annual', code: 'ANNUAL', nameLo: 'ລາພັກປະຈຳປີ', nameEn: 'Annual leave' },
  startDate: '2030-12-03', endDate: '2030-12-04', halfDay: 'NONE', multipleBirth: false, days: 2, reason: null, status: 'PENDING', filedAs: 'SELF',
  submittedByName: 'Phet', certificateRequired: false, certificateFileId: null, certificateDueDate: null, approvalRequestId: 'ap1', cancelRequest: null,
  cancelledAt: null, cancelReason: null, createdAt: '', ...over,
});

beforeEach(() => {
  mockBack.mockReset();
  mockPush.mockReset();
  usePrefsStore.setState({ locale: 'lo' });
  useAuthStore.setState({ accessToken: 'a', refreshToken: 'r', user: null });
});
afterEach(() => jest.restoreAllMocks());

describe('LeaveScreen (FR-LV-06.2)', () => {
  it('shows yearly balances and own requests and opens a request', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes('/leave/balances')) {
        return json({ employeeId: 'e1', year: 2030, balances: [{ leaveTypeId: 'annual', year: 2030, quotaPeriod: 'YEARLY', entitled: 15, carried: 0, used: 2, adjusted: 0, expired: 0, balance: 13, pending: 2 }] });
      }
      if (url.includes('/leave/types')) return json(TYPES);
      return json([request()]);
    });
    render(<LeaveScreen />, { wrapper });
    expect(await screen.findByTestId('leave-balance-ANNUAL')).toHaveTextContent(/13/);
    expect(await screen.findByTestId('leave-item-lr1')).toHaveTextContent(/2030-12-03 – 2030-12-04/);
    fireEvent.press(screen.getByTestId('leave-item-lr1'));
    expect(mockPush).toHaveBeenCalledWith('/leave/lr1');
    fireEvent.press(screen.getByTestId('leave-new'));
    expect(mockPush).toHaveBeenCalledWith('/leave/new');
  });
});

describe('NewLeaveScreen (FR-LV-03/06)', () => {
  it('previews the request from the API and files it', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes('/leave/types')) return json(TYPES);
      if (url.includes('/preview')) return json(preview());
      if (url.endsWith('/leave/requests') && init?.method === 'POST') return json(request(), 201);
      return json([]);
    });
    render(<NewLeaveScreen />, { wrapper });
    fireEvent.press(await screen.findByTestId('leave-type-ANNUAL'));
    fireEvent.changeText(screen.getByTestId('leave-start'), '2030-12-03');
    fireEvent.changeText(screen.getByTestId('leave-end'), '2030-12-04');
    expect(await screen.findByTestId('leave-preview-days')).toHaveTextContent('2');
    expect(screen.getByTestId('leave-preview-balance-2030')).toHaveTextContent('13');
    fireEvent.press(screen.getByTestId('leave-submit'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const post = fetchSpy.mock.calls.find(([u, i]) => urlOf(u).endsWith('/leave/requests') && i?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ leaveTypeId: 'annual', startDate: '2030-12-03', endDate: '2030-12-04', halfDay: 'NONE', multipleBirth: false });
  });
});

describe('LeaveRequestForm', () => {
  const base = { types: TYPES, delegates: [{ userId: 'u9', name: 'Kham', employeeCode: 'E009', isManager: false }], onInputChange: jest.fn(), onUploadPhoto: jest.fn() };

  it('blocks submit on rule errors from the preview', () => {
    const onSubmit = jest.fn();
    render(<LeaveRequestForm {...base} preview={{ data: preview({ errors: ['leave_insufficient_balance'] }), error: null }} onSubmit={onSubmit} />);
    expect(screen.getByTestId('leave-preview-rule')).toHaveTextContent('ວັນລາຄົງເຫຼືອບໍ່ພໍ');
    fireEvent.press(screen.getByTestId('leave-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires a delegate when the preview asks for one, shows the certificate photo button and API errors', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new ApiError(400, 'leave_overlaps_request', 'x'));
    const onInputChange = jest.fn();
    render(
      <LeaveRequestForm
        {...base}
        onInputChange={onInputChange}
        preview={{ data: preview({ needsDelegate: true, certificateRequired: true, certificateDueDate: '2030-12-09' }), error: null }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.press(screen.getByTestId('leave-type-SICK'));
    expect(screen.getByTestId('leave-certificate-photo')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('leave-start'), '2030-12-03');
    expect(onInputChange).toHaveBeenLastCalledWith({ leaveTypeId: 'sick', startDate: '2030-12-03', endDate: '2030-12-03', halfDay: 'NONE', multipleBirth: false });
    expect(screen.getByTestId('leave-preview-certificate')).toHaveTextContent(/2030-12-09/);
    fireEvent.press(screen.getByTestId('leave-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('ກະລຸນາເລືອກຜູ້ອະນຸມັດແທນໃນໄລຍະລາ')).toBeTruthy();
    fireEvent.press(screen.getByTestId('leave-delegate-E009'));
    fireEvent.press(screen.getByTestId('leave-submit'));
    expect(await screen.findByTestId('leave-form-error')).toHaveTextContent('ມີຄຳຂໍລາອື່ນໃນໄລຍະນີ້ແລ້ວ');
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ leaveTypeId: 'sick', delegateUserId: 'u9' }));
  });
});

describe('LeaveDetail (FR-LV-05.3, FR-LV-12)', () => {
  it('needs a reason to cancel approved leave', async () => {
    const onCancel = jest.fn().mockResolvedValue({});
    render(<LeaveDetail request={request({ status: 'APPROVED' })} onAttachPhoto={jest.fn()} onCancel={onCancel} />);
    fireEvent.press(screen.getByTestId('leave-cancel'));
    fireEvent.press(screen.getByTestId('leave-cancel-confirm'));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('leave-cancel-reason'), 'Plans changed');
    fireEvent.press(screen.getByTestId('leave-cancel-confirm'));
    await waitFor(() => expect(onCancel).toHaveBeenCalledWith('Plans changed'));
    expect(await screen.findByTestId('leave-notice')).toHaveTextContent('ສົ່ງຄຳຂໍຍົກເລີກແລ້ວ');
  });

  it('shows a missing certificate and hides cancel while a cancellation is pending', () => {
    render(
      <LeaveDetail
        request={request({ status: 'APPROVED', certificateRequired: true, certificateDueDate: '2030-12-09', cancelRequest: { id: 'c1', status: 'PENDING', reason: 'x', approvalRequestId: null } })}
        onAttachPhoto={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByTestId('leave-certificate-status')).toHaveTextContent('ຍັງບໍ່ແນບ — ກຳນົດ 2030-12-09');
    expect(screen.getByTestId('leave-attach')).toBeTruthy();
    expect(screen.getByTestId('leave-cancel-pending')).toBeTruthy();
    expect(screen.queryByTestId('leave-cancel')).toBeNull();
  });

  it('loads the request on the detail screen and withdraws a pending one', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) =>
      init?.method === 'POST' ? json({ id: 'lr1' }) : json(request()),
    );
    render(<LeaveDetailScreen />, { wrapper });
    fireEvent.press(await screen.findByTestId('leave-cancel'));
    fireEvent.press(screen.getByTestId('leave-cancel-confirm'));
    await waitFor(() => expect(fetchSpy.mock.calls.some(([u, i]) => urlOf(u).endsWith('/leave/requests/lr1/cancel') && i?.method === 'POST')).toBe(true));
  });
});
