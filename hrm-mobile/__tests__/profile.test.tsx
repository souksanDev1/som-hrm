import type { EmployeeDetail } from '@hrm/shared';
import { render, screen } from '@testing-library/react-native';
import ProfileScreen from '@/app/(tabs)/profile';
import { usePrefsStore } from '@/lib/i18n';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/features/auth/hooks', () => ({ useChangeLocale: () => jest.fn(), useLogout: () => jest.fn() }));
// The schedule card fetches on its own and has its own tests (schedule.test.tsx).
jest.mock('@/features/schedule/MyWorkScheduleCard', () => ({ MyWorkScheduleCard: () => null }));
const mockProfile: { data: Partial<EmployeeDetail> } = { data: {} };
jest.mock('@/features/profile/api', () => ({
  useMyProfile: () => ({ data: mockProfile.data, isPending: false, error: null, refetch: jest.fn(), isRefetching: false }),
}));

const profile: Partial<EmployeeDetail> = {
  id: 'e3', employeeCode: 'E003', firstName: 'ຄຳແພງ', lastName: 'ແກ້ວມະນີ', firstNameEn: 'Khamphaeng', lastNameEn: 'Keomany',
  village: 'ຫ້ວຍ', district: 'ປາກເຊ', province: 'CH', hireDate: '2025-01-10', phone: '02055550003',
  contractType: 'FIXED_TERM', payType: 'DAILY', position: null, department: null, branch: null,
  socialSecurityNo: 'SS1000003', familyBookNo: null, documents: [],
};

describe('ProfileScreen (M3 fields, read-only)', () => {
  it('shows the Lao and English name, the structured address and contract / pay type', () => {
    usePrefsStore.setState({ locale: 'lo' });
    mockProfile.data = profile;
    render(<ProfileScreen />);
    expect(screen.getByText('ຄຳແພງ ແກ້ວມະນີ')).toBeTruthy();
    expect(screen.getByTestId('profile-name-en')).toHaveTextContent('Khamphaeng Keomany');
    expect(screen.getByTestId('profile-address')).toHaveTextContent('ຫ້ວຍ, ປາກເຊ, ຈຳປາສັກ');
    expect(screen.getByTestId('profile-contract-type')).toHaveTextContent('ມີກຳນົດເວລາ');
    expect(screen.getByTestId('profile-pay-type')).toHaveTextContent('ລາຍວັນ');
  });

  it('translates in English and shows a dash for missing values', () => {
    usePrefsStore.setState({ locale: 'en' });
    mockProfile.data = { ...profile, firstNameEn: null, lastNameEn: null, village: null, district: null, province: null, payType: 'MONTHLY' };
    render(<ProfileScreen />);
    expect(screen.getByTestId('profile-name-en')).toHaveTextContent('—');
    expect(screen.getByTestId('profile-address')).toHaveTextContent('—');
    expect(screen.getByTestId('profile-contract-type')).toHaveTextContent('Fixed-term');
    expect(screen.getByTestId('profile-pay-type')).toHaveTextContent('Monthly');
  });
});
