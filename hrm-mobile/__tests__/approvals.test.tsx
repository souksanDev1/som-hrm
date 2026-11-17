import type { ApprovalInboxItem, ApprovalRequestDetail, DelegateCandidate, Delegation } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import ApprovalDetailScreen from '@/app/approvals/[id]';
import ApprovalsScreen from '@/app/approvals';
import { ApprovalDecisionPanel } from '@/features/approvals/ApprovalViews';
import { DelegationForm, DelegationList } from '@/features/approvals/DelegationViews';
import { useAuthStore } from '@/features/auth/store';
import { ApiError } from '@/lib/api';
import { usePrefsStore } from '@/lib/i18n';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a), replace: jest.fn() },
  Redirect: () => null,
  useLocalSearchParams: () => ({ id: 'req-1' }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })}>{children}</QueryClientProvider>
);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const item: ApprovalInboxItem = {
  id: 'req-1',
  subjectType: 'LEAVE',
  requester: { employeeId: 'e3', employeeCode: 'E003', name: 'Phet' },
  summary: { title: 'ລາພັກປະຈຳປີ · 1 ມື້', detail: '2026-12-01 – 2026-12-01 · Family event' },
  link: '/approvals/req-1',
  level: 1,
  requiredLevels: 1,
  myCapacity: 'MANAGER',
  submittedAt: '2026-11-15T00:00:00.000Z',
  pendingSince: '2026-11-15T00:00:00.000Z',
};

const detail: ApprovalRequestDetail = {
  id: 'req-1',
  subjectType: 'LEAVE',
  subjectId: 'lr-1',
  requester: item.requester,
  summary: item.summary,
  link: item.link,
  status: 'PENDING',
  currentStep: 1,
  requiredLevels: 1,
  submittedAt: item.submittedAt,
  decidedAt: null,
  myCapacity: 'MANAGER',
  steps: [
    {
      id: 's1', level: 1, approver: { userId: 'u-mgr', name: 'Somsak' }, delegate: null, actingAs: 'MANAGER', decision: 'PENDING',
      decidedBy: null, decidedAt: null, note: null, createdAt: '2026-11-15T00:00:00.000Z',
    },
  ],
};

const candidates: DelegateCandidate[] = [{ userId: 'u-1', name: 'Kham', employeeCode: 'E010', isManager: false }];

beforeEach(() => {
  mockPush.mockReset();
  usePrefsStore.setState({ locale: 'lo' });
  useAuthStore.setState({ accessToken: 'a', refreshToken: 'r', user: null });
});
afterEach(() => jest.restoreAllMocks());

describe('ApprovalsScreen', () => {
  it('lists pending requests and opens one', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => json({ items: [item], total: 1, page: 1, pageSize: 50 }));
    render(<ApprovalsScreen />, { wrapper });
    const row = await screen.findByTestId('approval-row');
    expect(within(row).getByText('Phet')).toBeTruthy();
    expect(within(row).getByText('ຫົວໜ້າ')).toBeTruthy();
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith('/approvals/req-1');
  });

  it('shows the empty inbox', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => json({ items: [], total: 0, page: 1, pageSize: 50 }));
    render(<ApprovalsScreen />, { wrapper });
    expect(await screen.findByText('ບໍ່ມີຄຳຂໍທີ່ລໍຖ້າທ່ານ')).toBeTruthy();
  });
});

describe('ApprovalDetailScreen', () => {
  it('shows the summary, history and approves with a note', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => json(detail));
    render(<ApprovalDetailScreen />, { wrapper });
    expect(await screen.findByText('2026-12-01 – 2026-12-01 · Family event')).toBeTruthy();
    expect(screen.getAllByTestId('approval-step')).toHaveLength(1);
    fireEvent.changeText(screen.getByTestId('approval-note'), 'enjoy');
    fireEvent.press(screen.getByTestId('approval-approve'));
    await screen.findByTestId('approval-detail');
    const post = fetchSpy.mock.calls.find((c) => String(c[0]).endsWith('/approvals/req-1/approve'));
    expect(post).toBeTruthy();
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ note: 'enjoy' });
  });
});

describe('ApprovalDecisionPanel', () => {
  it('needs a reason to reject and shows API errors', async () => {
    const onDecide = jest.fn().mockRejectedValue(new ApiError(409, 'approval_already_decided', 'x'));
    render(<ApprovalDecisionPanel capacity="DELEGATE" onDecide={onDecide} />);
    expect(screen.getByText('ໃນຖານະ ຜູ້ອະນຸມັດແທນ')).toBeTruthy();
    fireEvent.press(screen.getByTestId('approval-reject'));
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByText('ເຫດຜົນທີ່ປະຕິເສດ')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('approval-note'), 'busy week');
    fireEvent.press(screen.getByTestId('approval-reject'));
    expect(onDecide).toHaveBeenCalledWith('reject', 'busy week');
    expect(await screen.findByText('ຄຳຂໍນີ້ຖືກຕັດສິນແລ້ວ')).toBeTruthy();
  });
});

describe('Delegations', () => {
  it('validates the period before submitting', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<DelegationForm candidates={candidates} today="2026-11-17" onSubmit={onSubmit} />);
    fireEvent.press(screen.getByTestId('delegation-save'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('ຈຳເປັນຕ້ອງໃສ່')).toBeTruthy();

    fireEvent.press(screen.getByTestId('delegate-option-E010'));
    fireEvent.changeText(screen.getByTestId('delegation-end'), '2026-11-10');
    fireEvent.press(screen.getByTestId('delegation-save'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('ວັນສິ້ນສຸດຕ້ອງບໍ່ກ່ອນວັນເລີ່ມ')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('delegation-end'), '2026-11-20');
    fireEvent.press(screen.getByTestId('delegation-save'));
    expect(onSubmit).toHaveBeenCalledWith({ delegateUserId: 'u-1', startDate: '2026-11-17', endDate: '2026-11-20', reason: undefined });
    expect(await screen.findByTestId('delegation-form')).toBeTruthy();
  });

  it('lists delegations and only lets the delegator cancel active ones', () => {
    const d = (over: Partial<Delegation>): Delegation => ({
      id: 'd1', delegator: { userId: 'me', name: 'Somsak' }, delegate: { userId: 'u-1', name: 'Kham' }, startDate: '2026-11-17', endDate: '2026-11-20',
      reason: null, status: 'ACTIVE', createdAt: '2026-11-17T00:00:00.000Z', ...over,
    });
    const onCancel = jest.fn();
    render(<DelegationList userId="me" onCancel={onCancel} items={[d({}), d({ id: 'd2', status: 'ENDED' }), d({ id: 'd3', delegator: { userId: 'x', name: 'Vong' }, delegate: { userId: 'me', name: 'Somsak' } })]} />);
    expect(screen.getAllByTestId('delegation-row')).toHaveLength(3);
    expect(screen.getAllByText('ຂ້ອຍ → Kham')).toHaveLength(2);
    expect(screen.getByText('Vong → ຂ້ອຍ')).toBeTruthy();
    const cancels = screen.getAllByTestId('delegation-cancel');
    expect(cancels).toHaveLength(1);
    fireEvent.press(cancels[0]!);
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }));
  });
});
