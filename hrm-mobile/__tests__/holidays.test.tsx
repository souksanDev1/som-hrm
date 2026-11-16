import type { Holiday } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import HolidaysScreen from '@/app/holidays';
import { useAuthStore } from '@/features/auth/store';
import { HolidayYearList } from '@/features/holidays/HolidayYearList';
import { usePrefsStore } from '@/lib/i18n';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, Redirect: () => null }));

const h = (over: Partial<Holiday>): Holiday => ({
  id: over.date ?? 'id', date: '2026-01-01', nameLo: 'ວັນປີໃໝ່ສາກົນ', nameEn: "New Year's Day", kind: 'PUBLIC', womenOnly: false, nationality: null, isDefault: true, ...over,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}>{children}</QueryClientProvider>
);

beforeEach(() => {
  usePrefsStore.setState({ locale: 'lo' });
  useAuthStore.setState({ accessToken: 'a', refreshToken: 'r', user: null });
});
afterEach(() => jest.restoreAllMocks());

describe('HolidayYearList', () => {
  it('shows localized names, kinds and the women-only badge', () => {
    render(<HolidayYearList today="2026-06-01" holidays={[h({}), h({ date: '2026-03-08', nameLo: 'ວັນແມ່ຍິງສາກົນ', womenOnly: true }), h({ date: '2026-10-21', nameLo: 'ບຸນອອກພັນສາ', kind: 'TRADITIONAL', isDefault: false })]} />);
    const rows = screen.getAllByTestId('holiday-row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText('ສະເພາະພະນັກງານຍິງ')).toBeTruthy();
    expect(within(rows[2]!).getByText('ບຸນປະເພນີ')).toBeTruthy();
  });

  it('switches to English names', () => {
    usePrefsStore.setState({ locale: 'en' });
    render(<HolidayYearList today="2026-06-01" holidays={[h({})]} />);
    expect(screen.getByText("New Year's Day")).toBeTruthy();
    expect(screen.getByText('Public holiday')).toBeTruthy();
  });
});

describe('HolidaysScreen', () => {
  it('loads the signed-in employee\'s holidays for this year', async () => {
    const year = new Date().getFullYear();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([h({ date: `${year}-05-01`, nameLo: 'ວັນກຳມະກອນສາກົນ' })]), { status: 200 }));
    render(<HolidaysScreen />, { wrapper });
    expect(await screen.findByText('ວັນກຳມະກອນສາກົນ')).toBeTruthy();
    expect(screen.getByText(`ວັນພັກປີນີ້ ${year}`)).toBeTruthy();
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(`/holidays/mine?year=${year}`);
  });
});
