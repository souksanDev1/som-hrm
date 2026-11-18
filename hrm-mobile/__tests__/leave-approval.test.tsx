import type { ApprovalRequestDetail, ApprovalTeamLeave } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import ApprovalDetailScreen from '@/app/approvals/[id]';
import { ApprovalStepList } from '@/features/approvals/ApprovalViews';
import { TeamOnLeaveList } from '@/features/approvals/TeamOnLeaveList';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore } from '@/lib/i18n';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  Redirect: () => null,
  useLocalSearchParams: () => ({ id: 'req-1' }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}>{children}</QueryClientProvider>
);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const member = (over: Partial<ApprovalTeamLeave> = {}): ApprovalTeamLeave => ({
  requestId: 'lr-1',
  employeeId: 'e-1',
  employeeCode: 'E001',
  name: 'Kham Vong',
  startDate: '2026-12-07',
  endDate: '2026-12-09',
  halfDay: 'NONE',
  days: 3,
  status: 'APPROVED',
  ...over,
});

const detail = (over: Partial<ApprovalRequestDetail> = {}): ApprovalRequestDetail => ({
  id: 'req-1',
  subjectType: 'LEAVE',
  subjectId: 'lr-0',
  status: 'PENDING',
  requester: { employeeId: 'e-0', employeeCode: 'E000', name: 'Phet' },
  summary: { title: 'ລາພັກປະຈຳປີ · 1 ມື້', detail: '2026-12-08' },
  link: '/approvals/req-1',
  currentStep: 1,
  requiredLevels: 1,
  submittedAt: '2026-11-15T00:00:00.000Z',
  decidedAt: null,
  myCapacity: null,
  steps: [],
  ...over,
});

beforeEach(() => {
  usePrefsStore.setState({ locale: 'lo' });
  useAuthStore.setState({ accessToken: 'a', refreshToken: 'r', user: null });
});
afterEach(() => jest.restoreAllMocks());

describe('TeamOnLeaveList (FR-LV-13.10)', () => {
  it('lists colleagues with dates, half day, days and a pending marker', () => {
    render(<TeamOnLeaveList members={[member(), member({ requestId: 'lr-2', name: 'Noy', employeeCode: 'E002', startDate: '2026-12-08', endDate: '2026-12-08', halfDay: 'AM', days: 0.5, status: 'PENDING' })]} />);
    const rows = screen.getAllByTestId('team-on-leave-item');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Kham Vong · E001')).toBeTruthy();
    expect(within(rows[0]!).getByText('2026-12-07 – 2026-12-09 · 3 ມື້')).toBeTruthy();
    expect(within(rows[0]!).queryByText('ລໍຖ້າອະນຸມັດ')).toBeNull();
    expect(within(rows[1]!).getByText('2026-12-08 (ເຄິ່ງມື້ເຊົ້າ) · 0.5 ມື້')).toBeTruthy();
    expect(within(rows[1]!).getByText('ລໍຖ້າອະນຸມັດ')).toBeTruthy();
  });

  it('says so when nobody else is away', () => {
    render(<TeamOnLeaveList members={[]} />);
    expect(screen.getByText('ບໍ່ມີເພື່ອນຮ່ວມທີມລາໃນຊ່ວງນີ້')).toBeTruthy();
  });

  it('appears on the approval detail screen only when the API sends the list', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => json(detail({ teamOnLeave: [member()] })));
    const { unmount } = render(<ApprovalDetailScreen />, { wrapper });
    expect(await screen.findByText('ເພື່ອນຮ່ວມທີມທີ່ລາໃນຊ່ວງດຽວກັນ')).toBeTruthy();
    expect(screen.getAllByTestId('team-on-leave-item')).toHaveLength(1);
    unmount();

    jest.spyOn(global, 'fetch').mockImplementation(async () => json(detail()));
    render(<ApprovalDetailScreen />, { wrapper });
    await screen.findByTestId('approval-detail');
    expect(screen.queryByTestId('team-on-leave')).toBeNull();
  });
});

describe('ApprovalStepList of a withdrawn request (FR-LV-12.1)', () => {
  it('shows the open step as withdrawn by whoever cancelled it', () => {
    render(
      <ApprovalStepList
        requiredLevels={1}
        requestStatus="CANCELLED"
        steps={[
          {
            id: 's1', level: 1, approver: { userId: 'u-m', name: 'Manager' }, delegate: null, actingAs: 'MANAGER', decision: 'PENDING',
            decidedBy: { userId: 'u-e', name: 'Phet' }, decidedAt: '2026-11-18T04:00:00.000Z', note: null, createdAt: '2026-11-17T03:00:00.000Z',
          },
        ]}
      />,
    );
    expect(screen.getByText('ຖອນຄຳຂໍແລ້ວ')).toBeTruthy();
    expect(screen.queryByText('ລໍຖ້າ')).toBeNull();
    expect(screen.getByTestId('approval-step-meta')).toHaveTextContent('ຖອນຄຳຂໍໂດຍ Phet · 2026-11-18');
  });
});
