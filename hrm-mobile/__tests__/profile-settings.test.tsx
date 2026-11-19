import type { EmployeeDetail } from '@hrm/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import AppearanceScreen from '@/app/me/appearance';
import LanguageScreen from '@/app/me/language';
import PersonalInfoScreen from '@/app/me/personal';
import MyScheduleScreen from '@/app/me/schedule';
import { usePrefsStore } from '@/lib/i18n';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
const mockChangeLocale = jest.fn();
jest.mock('@/features/auth/hooks', () => ({ useChangeLocale: () => mockChangeLocale }));
jest.mock('@/features/schedule/MyWorkScheduleCard', () => ({
  MyWorkScheduleCard: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text testID="my-work-schedule">Schedule summary</Text>;
  },
}));
const mockProfile: { data: Partial<EmployeeDetail> | undefined } = { data: undefined };
jest.mock('@/features/profile/api', () => ({
  useMyProfile: () => ({ data: mockProfile.data, isPending: false, error: null, refetch: jest.fn(), isRefetching: false }),
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
  usePrefsStore.setState({ locale: 'lo', theme: 'system' });
  mockProfile.data = profile;
});

describe('Personal information page', () => {
  it('shows every existing field and document status, with a back button', () => {
    render(<PersonalInfoScreen />);
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
    fireEvent.press(screen.getByTestId('personal-back'));
    expect(router.back).toHaveBeenCalled();
  });

  it('translates in English and shows a dash for missing values', () => {
    usePrefsStore.setState({ locale: 'en' });
    mockProfile.data = { ...profile, firstNameEn: null, lastNameEn: null, village: null, district: null, province: null, payType: 'MONTHLY', documents: [] };
    render(<PersonalInfoScreen />);
    expect(screen.getByText('Personal information')).toBeTruthy();
    expect(screen.getByTestId('profile-name-en')).toHaveTextContent('—');
    expect(screen.getByTestId('profile-address')).toHaveTextContent('—');
    expect(screen.getByTestId('profile-contract-type')).toHaveTextContent('Fixed-term');
    expect(screen.getByTestId('profile-pay-type')).toHaveTextContent('Monthly');
    expect(screen.queryByTestId('expiry-EXPIRING')).toBeNull();
  });
});

describe('Work schedule page', () => {
  it('shows the schedule card with a back button', () => {
    render(<MyScheduleScreen />);
    expect(screen.getByTestId('my-work-schedule')).toBeTruthy();
    fireEvent.press(screen.getByTestId('my-schedule-back'));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('Language page', () => {
  it('lists both languages with flags and marks the current one', () => {
    render(<LanguageScreen />);
    expect(screen.getByText('🇱🇦', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('🇬🇧', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('language-lo')).toHaveProp('accessibilityState', { checked: true });
    expect(screen.getByTestId('language-en')).toHaveProp('accessibilityState', { checked: false });
  });

  it('changes language through the existing callback and ignores the current one', () => {
    render(<LanguageScreen />);
    fireEvent.press(screen.getByTestId('language-lo'));
    expect(mockChangeLocale).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('language-en'));
    expect(mockChangeLocale).toHaveBeenCalledWith('en');
    fireEvent.press(screen.getByTestId('language-back'));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('Appearance page', () => {
  it('defaults to system and saves light or dark', () => {
    render(<AppearanceScreen />);
    expect(screen.getByTestId('theme-system')).toHaveProp('accessibilityState', { checked: true });
    fireEvent.press(screen.getByTestId('theme-dark'));
    expect(usePrefsStore.getState().theme).toBe('dark');
    expect(screen.getByTestId('theme-dark')).toHaveProp('accessibilityState', { checked: true });
    fireEvent.press(screen.getByTestId('theme-light'));
    expect(usePrefsStore.getState().theme).toBe('light');
    fireEvent.press(screen.getByTestId('appearance-back'));
    expect(router.back).toHaveBeenCalled();
  });
});
