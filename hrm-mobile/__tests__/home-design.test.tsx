import type { EmployeeDetail, LeaveBalance, Me } from '@hrm/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import HomeScreen from '@/app/(tabs)/home';
import { EmployeeHeader } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore } from '@/lib/i18n';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
const mockProfile: { data?: Partial<EmployeeDetail> } = { data: undefined };
const mockBalances: { data?: { year: number; balances: Partial<LeaveBalance>[] }; isPending: boolean; error: unknown; refetch: jest.Mock } = {
  data: { year: 2026, balances: [] }, isPending: false, error: null, refetch: jest.fn(),
};
jest.mock('@/features/profile/api', () => ({ useMyProfile: () => mockProfile }));
jest.mock('@/features/notifications/api', () => ({ useUnreadCount: () => ({ data: { count: 13 } }) }));
jest.mock('@/features/leave/api', () => ({
  useMyLeaveBalances: () => mockBalances,
  useLeaveTypes: () => ({ data: [{ id: 'annual', nameLo: 'ລາພັກປະຈຳປີ', nameEn: 'Annual leave' }] }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ locale: 'en' });
  useAuthStore.setState({ user: { displayName: 'Demo employee', workspaceName: 'Demo workspace' } as Me });
  mockProfile.data = { firstName: 'Anna', lastName: 'A', employeeCode: 'E003', position: { id: 'p', name: 'Accountant' }, department: { id: 'd', name: 'Finance' } };
  mockBalances.data = { year: 2026, balances: [{ leaveTypeId: 'annual', quotaPeriod: 'YEARLY', entitled: 15, carried: 2, adjusted: 1, balance: 11.5 }] };
  mockBalances.error = null;
});

describe('Home presentation', () => {
  it('uses the employee profile with an honest avatar fallback and the unchanged balance ledger', () => {
    render(<HomeScreen />);
    expect(screen.getByTestId('home-avatar').props.accessibilityLabel).toBe('Anna A');
    expect(screen.getByTestId('home-greeting')).toHaveTextContent('Anna A');
    expect(screen.getByTestId('home-employee-code')).toHaveTextContent('E003');
    expect(screen.getByText('Accountant · Finance')).toBeTruthy();
    expect(screen.getByText('11.5/18')).toBeTruthy();
    expect(screen.getByText('Annual leave')).toBeTruthy();
    expect(screen.getByTestId('header-unread-count')).toHaveTextContent('13');
  });

  it('keeps profile, leave, overtime, approvals, calendar and notification destinations', () => {
    render(<HomeScreen />);
    const links = [
      ['home-profile', '/profile'], ['open-leave', '/leave'], ['open-overtime', '/overtime'],
      ['open-approvals', '/approvals'], ['open-leave-calendar', '/leave-calendar'],
      ['home-header-notifications', '/notifications'], ['open-attendance', '/checkin'],
      ['home-view-balances', '/leave?tab=balances'],
    ];
    for (const [id, route] of links) {
      fireEvent.press(screen.getByTestId(id!));
      expect(router.push).toHaveBeenLastCalledWith(route);
    }
  });

  it('does not invent an employee or leave balance when profile/balances are unavailable', () => {
    mockProfile.data = undefined;
    mockBalances.data = { year: 2026, balances: [] };
    render(<HomeScreen />);
    expect(screen.getByTestId('home-greeting')).toHaveTextContent('Demo employee');
    expect(screen.queryByTestId('home-employee-code')).toBeNull();
    expect(screen.getByText('No leave balances yet')).toBeTruthy();
  });

  it('offers retry on balance errors without blocking shortcuts', () => {
    mockBalances.error = new Error('offline');
    render(<HomeScreen />);
    expect(screen.getByTestId('open-leave')).toBeTruthy();
    expect(screen.queryByText('11.5/18')).toBeNull();
  });
});

describe('Employee header', () => {
  it('caps the unread badge and preserves accessible count and back navigation', () => {
    render(<EmployeeHeader title="Organization" back unread={125} />);
    expect(screen.getByTestId('header-unread-count')).toHaveTextContent('99+');
    fireEvent.press(screen.getByLabelText('Notifications (125)'));
    expect(router.push).toHaveBeenCalledWith('/notifications');
    fireEvent.press(screen.getByLabelText('Back'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
