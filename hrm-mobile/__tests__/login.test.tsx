import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { LoginForm } from '@/features/auth/LoginForm';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore } from '@/lib/i18n';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity }, queries: { gcTime: Infinity } } })}>{children}</QueryClientProvider>
);

const loginResponse = {
  accessToken: 'a', refreshToken: 'r', expiresIn: 900,
  user: { id: 'u', workspaceId: 'w', workspaceName: 'SOM', displayName: 'ຄຳແພງ', email: null, roles: ['EMPLOYEE'], permissions: ['org.read'], employeeId: 'e', mustChangeCredential: false, locale: 'lo' },
};

beforeEach(() => {
  usePrefsStore.setState({ locale: 'lo' });
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
});
afterEach(() => jest.restoreAllMocks());

describe('LoginForm (mobile)', () => {
  it('validates the PIN before calling the API', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    render(<LoginForm onSuccess={jest.fn()} />, { wrapper });
    fireEvent.changeText(screen.getByTestId('input-workspace'), 'som-demo');
    fireEvent.changeText(screen.getByTestId('input-identifier'), 'E003');
    fireEvent.changeText(screen.getByTestId('input-pin'), '12');
    fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('PIN ຕ້ອງເປັນຕົວເລກ 6 ຕົວ')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('signs in with phone + PIN and stores the session', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(loginResponse), { status: 200 }));
    const onSuccess = jest.fn();
    render(<LoginForm onSuccess={onSuccess} />, { wrapper });
    fireEvent.changeText(screen.getByTestId('input-workspace'), 'SOM-DEMO');
    fireEvent.changeText(screen.getByTestId('input-identifier'), '020 5555 0003');
    fireEvent.changeText(screen.getByTestId('input-pin'), '482913');
    fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/auth\/login\/pin$/);
    expect(JSON.parse(String(init!.body))).toMatchObject({ workspaceCode: 'som-demo', pin: '482913' });
    expect(useAuthStore.getState().accessToken).toBe('a');
    expect(useAuthStore.getState().lastLoginMethod).toBe('PIN');
  });

  it('shows the translated API error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'account_locked', message: '' } }), { status: 423 }),
    );
    render(<LoginForm onSuccess={jest.fn()} />, { wrapper });
    fireEvent.changeText(screen.getByTestId('input-workspace'), 'som-demo');
    fireEvent.changeText(screen.getByTestId('input-identifier'), 'E003');
    fireEvent.changeText(screen.getByTestId('input-pin'), '482913');
    fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByTestId('login-error')).toHaveTextContent('ບັນຊີຖືກລັອກຊົ່ວຄາວ ກະລຸນາລອງໃໝ່ພາຍຫຼັງ');
  });
});
