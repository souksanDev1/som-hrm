import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ChangePinForm } from '@/features/auth/ChangePinForm';
import { ForgotForm } from '@/features/auth/ForgotForm';
import { homeRouteFor } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore } from '@/lib/i18n';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity }, queries: { gcTime: Infinity } } })}>{children}</QueryClientProvider>
);

const me = {
  id: 'u', workspaceId: 'w', workspaceName: 'SOM', displayName: 'ຄຳແພງ', email: null, roles: ['EMPLOYEE'], permissions: [], employeeId: 'e',
  mustChangeCredential: false, phoneVerificationRequired: false, hasPassword: false, hasPin: true, locale: 'lo',
};

beforeEach(() => {
  usePrefsStore.setState({ locale: 'lo' });
  useAuthStore.setState({ accessToken: 'a', refreshToken: 'r', user: null });
});
afterEach(() => jest.restoreAllMocks());

describe('homeRouteFor', () => {
  it('sends pending users to the setup screens, phone first', () => {
    expect(homeRouteFor(null)).toBe('/home');
    expect(homeRouteFor({ phoneVerificationRequired: false, mustChangeCredential: false })).toBe('/home');
    expect(homeRouteFor({ phoneVerificationRequired: false, mustChangeCredential: true })).toBe('/change-pin');
    expect(homeRouteFor({ phoneVerificationRequired: true, mustChangeCredential: true })).toBe('/verify-phone');
  });
});

describe('ChangePinForm', () => {
  it('sets an initial PIN without the current PIN and refreshes the principal', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/auth/me') ? new Response(JSON.stringify(me), { status: 200 }) : new Response(null, { status: 204 }),
    );
    const onSuccess = jest.fn();
    render(<ChangePinForm hasPin={false} onSuccess={onSuccess} />, { wrapper });
    expect(screen.queryByTestId('input-current-pin')).toBeNull();
    fireEvent.changeText(screen.getByTestId('input-new-pin'), '730261');
    fireEvent.press(screen.getByTestId('change-pin-submit'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body))).toEqual({ newPin: '730261' });
    expect(useAuthStore.getState().user?.hasPin).toBe(true);
  });

  it('requires the current PIN when one exists', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    render(<ChangePinForm onSuccess={jest.fn()} />, { wrapper });
    fireEvent.changeText(screen.getByTestId('input-current-pin'), '12');
    fireEvent.changeText(screen.getByTestId('input-new-pin'), '730261');
    fireEvent.press(screen.getByTestId('change-pin-submit'));
    expect(await screen.findByText('PIN ຕ້ອງເປັນຕົວເລກ 6 ຕົວ')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('ForgotForm', () => {
  it('shows the generic confirmation and resets the PIN with the SMS code', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/forgot')
        ? new Response(JSON.stringify({ resendAfterSeconds: 60, maskedPhone: null }), { status: 202 })
        : new Response(null, { status: 204 }),
    );
    const onDone = jest.fn();
    render(<ForgotForm defaultWorkspaceCode="som-demo" onDone={onDone} />, { wrapper });
    fireEvent.changeText(screen.getByTestId('forgot-identifier'), 'E003');
    fireEvent.press(screen.getByTestId('forgot-send'));
    expect(await screen.findByTestId('forgot-sent')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('reset-code'), '123456');
    fireEvent.changeText(screen.getByTestId('reset-secret'), '111111');
    fireEvent.press(screen.getByTestId('reset-submit'));
    expect(await screen.findByText('PIN ງ່າຍເກີນໄປ')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('reset-secret'), '730261');
    fireEvent.press(screen.getByTestId('reset-submit'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const call = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/auth/pin/reset'))!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ workspaceCode: 'som-demo', identifier: 'E003', code: '123456', newPin: '730261' });
  });
});
