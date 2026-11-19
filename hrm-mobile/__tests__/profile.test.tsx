import type { EmployeeDetail } from '@hrm/shared';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import ProfileScreen from '@/app/(tabs)/profile';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore } from '@/lib/i18n';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
const mockLogout = jest.fn();
jest.mock('@/features/auth/hooks', () => ({ useLogout: () => mockLogout }));
const mockProfile: { data: Partial<EmployeeDetail> | undefined; error: unknown } = { data: {}, error: null };
jest.mock('@/features/profile/api', () => ({
  useMyProfile: () => ({ data: mockProfile.data, isPending: false, error: mockProfile.error, refetch: jest.fn(), isRefetching: false }),
}));

const profile: Partial<EmployeeDetail> = {
  id: 'e3', employeeCode: 'E003', firstName: 'ຄຳແພງ', lastName: 'ແກ້ວມະນີ', firstNameEn: 'Khamphaeng', lastNameEn: 'Keomany',
  village: 'ຫ້ວຍ', district: 'ປາກເຊ', province: 'CH', hireDate: '2025-01-10', phone: '02055550003',
  contractType: 'FIXED_TERM', payType: 'DAILY',
  position: { id: 'p1', name: 'Accountant' }, department: { id: 'd1', name: 'Finance' }, branch: { id: 'b1', name: 'Pakse' },
  socialSecurityNo: 'SS1000003', familyBookNo: 'FB003',
  documents: [{
    id: 'doc1', type: 'PASSPORT', number: null, issuedAt: null, expiresAt: '2026-12-01', note: null,
    expiryStatus: 'EXPIRING', daysUntilExpiry: 7, expiryThresholdDays: 7, file: null,
  }],
};

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ locale: 'lo' });
  useAuthStore.setState({ lastLoginMethod: 'PIN' });
  mockProfile.data = profile;
  mockProfile.error = null;
  mockLogout.mockResolvedValue(undefined);
});

describe('ProfileScreen menu', () => {
  it('shows the real employee summary and keeps details on their own page', () => {
    render(<ProfileScreen />);
    expect(screen.getByTestId('profile-avatar')).toHaveProp('accessibilityLabel', 'ຄຳແພງ ແກ້ວມະນີ');
    expect(screen.getByText('Accountant · Finance')).toBeTruthy();
    expect(screen.getByTestId('profile-hero-code')).toHaveTextContent(/E003/);
    expect(screen.queryByTestId('profile-name-en')).toBeNull();
    expect(screen.queryByTestId('my-work-schedule')).toBeNull();
  });

  it.each([
    ['open-org', '/org'],
    ['open-notifications', '/notifications'],
    ['header-notifications', '/notifications'],
    ['open-holidays', '/holidays'],
    ['open-correction', '/attendance/correction'],
    ['open-change-device', '/attendance/change-device'],
    ['open-change-pin', '/change-pin'],
    ['open-personal-info', '/me/personal'],
    ['open-work-schedule', '/me/schedule'],
    ['open-language', '/me/language'],
    ['open-appearance', '/me/appearance'],
  ])('%s opens the existing route %s', (testID, route) => {
    render(<ProfileScreen />);
    fireEvent.press(screen.getByTestId(testID));
    expect(router.push).toHaveBeenCalledWith(route);
  });

  it('hides the change-PIN row for password sign-in', () => {
    useAuthStore.setState({ lastLoginMethod: 'PASSWORD' });
    render(<ProfileScreen />);
    expect(screen.queryByTestId('open-change-pin')).toBeNull();
  });

  it.each([['lo', '🇱🇦  ພາສາລາວ', 'ຕາມລະບົບ'], ['en', '🇬🇧  English', 'System']] as const)('shows the current language (%s) and theme on their rows', (locale, language, theme) => {
    usePrefsStore.setState({ locale, theme: 'system' });
    render(<ProfileScreen />);
    expect(screen.getByText(language)).toBeTruthy();
    expect(screen.getByText(theme)).toBeTruthy();
  });

  it('awaits logout before replacing the route with login', async () => {
    let completeLogout!: () => void;
    mockLogout.mockReturnValueOnce(new Promise<void>((resolve) => { completeLogout = resolve; }));
    render(<ProfileScreen />);
    fireEvent.press(screen.getByTestId('logout'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => completeLogout());
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('keeps existing account actions available when the profile query fails', () => {
    mockProfile.data = undefined;
    mockProfile.error = new Error('unavailable');
    render(<ProfileScreen />);
    expect(screen.getByTestId('state-error')).toBeTruthy();
    fireEvent.press(screen.getByTestId('open-holidays'));
    expect(router.push).toHaveBeenCalledWith('/holidays');
    fireEvent.press(screen.getByTestId('open-language'));
    expect(router.push).toHaveBeenCalledWith('/me/language');
    expect(screen.getByTestId('logout')).toBeTruthy();
  });
});
