import type { EmployeeDetail } from '@hrm/shared';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import ProfileScreen from '@/app/(tabs)/profile';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore } from '@/lib/i18n';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
const mockChangeLocale = jest.fn();
const mockLogout = jest.fn();
jest.mock('@/features/auth/hooks', () => ({ useChangeLocale: () => mockChangeLocale, useLogout: () => mockLogout }));
// The schedule card fetches on its own and has its own tests (schedule.test.tsx).
jest.mock('@/features/schedule/MyWorkScheduleCard', () => ({
  MyWorkScheduleCard: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text testID="my-work-schedule">Schedule summary</Text>;
  },
}));
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
  it('shows the real employee summary and keeps details collapsed on arrival', () => {
    render(<ProfileScreen />);
    expect(screen.getByTestId('profile-avatar')).toHaveProp('accessibilityLabel', 'ຄຳແພງ ແກ້ວມະນີ');
    expect(screen.getByText('ຄຳແພງ ແກ້ວມະນີ')).toBeTruthy();
    expect(screen.getByText('Accountant · Finance')).toBeTruthy();
    expect(screen.getByTestId('profile-hero-code')).toHaveTextContent(/E003/);
    expect(screen.getByTestId('toggle-personal-info')).toHaveProp('accessibilityState', { expanded: false });
    expect(screen.queryByTestId('profile-name-en')).toBeNull();
    expect(screen.queryByTestId('expiry-EXPIRING')).toBeNull();
  });

  it('expands personal information with every existing field and document status', () => {
    render(<ProfileScreen />);
    fireEvent.press(screen.getByTestId('toggle-personal-info'));
    expect(screen.getByTestId('toggle-personal-info')).toHaveProp('accessibilityState', { expanded: true });
    expect(screen.getByTestId('profile-code')).toHaveTextContent('E003');
    expect(screen.getByTestId('profile-name-en')).toHaveTextContent('Khamphaeng Keomany');
    expect(screen.getByTestId('profile-address')).toHaveTextContent('ຫ້ວຍ, ປາກເຊ, ຈຳປາສັກ');
    expect(screen.getByTestId('profile-contract-type')).toHaveTextContent('ມີກຳນົດເວລາ');
    expect(screen.getByTestId('profile-pay-type')).toHaveTextContent('ລາຍວັນ');
    expect(screen.getByTestId('profile-ssn')).toHaveTextContent('SS1000003');
    for (const value of ['Accountant', 'Finance', 'Pakse', '2025-01-10', '02055550003', 'FB003', '2026-12-01']) {
      expect(screen.getByText(value)).toBeTruthy();
    }
    expect(screen.getByTestId('expiry-EXPIRING')).toBeTruthy();
    fireEvent.press(screen.getByTestId('toggle-personal-info'));
    expect(screen.queryByTestId('profile-name-en')).toBeNull();
    expect(screen.queryByTestId('expiry-EXPIRING')).toBeNull();
  });

  it('translates in English and shows a dash for missing values', () => {
    usePrefsStore.setState({ locale: 'en' });
    mockProfile.data = { ...profile, firstNameEn: null, lastNameEn: null, village: null, district: null, province: null, payType: 'MONTHLY', documents: [] };
    render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Personal information' }));
    expect(screen.getByTestId('profile-name-en')).toHaveTextContent('—');
    expect(screen.getByTestId('profile-address')).toHaveTextContent('—');
    expect(screen.getByTestId('profile-contract-type')).toHaveTextContent('Fixed-term');
    expect(screen.getByTestId('profile-pay-type')).toHaveTextContent('Monthly');
    expect(screen.queryByTestId('expiry-EXPIRING')).toBeNull();
  });

  it('expands the work schedule independently without unmounting its query', () => {
    render(<ProfileScreen />);
    expect(screen.queryByTestId('my-work-schedule')).toBeNull();
    expect(screen.getByTestId('my-work-schedule', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByTestId('toggle-work-schedule'));
    expect(screen.getByTestId('toggle-work-schedule')).toHaveProp('accessibilityState', { expanded: true });
    expect(screen.getByTestId('my-work-schedule')).toBeVisible();
    expect(screen.getByTestId('toggle-personal-info')).toHaveProp('accessibilityState', { expanded: false });
    fireEvent.press(screen.getByTestId('toggle-work-schedule'));
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

  it.each([['lo', 'en', 'English'], ['en', 'lo', 'ພາສາລາວ']] as const)('changes locale from %s to %s through the existing callback', (locale, next, label) => {
    usePrefsStore.setState({ locale });
    render(<ProfileScreen />);
    expect(screen.getByText(label)).toBeTruthy();
    fireEvent.press(screen.getByTestId('toggle-locale'));
    expect(mockChangeLocale).toHaveBeenCalledWith(next);
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
    fireEvent.press(screen.getByTestId('toggle-locale'));
    expect(mockChangeLocale).toHaveBeenCalledWith('en');
    expect(screen.getByTestId('logout')).toBeTruthy();
  });
});
