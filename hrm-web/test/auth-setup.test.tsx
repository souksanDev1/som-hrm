import type { Me } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSetup } from '@/features/auth/components/AccountSetup';
import { ChangePinForm } from '@/features/auth/components/ChangePinForm';
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore } from '@/lib/i18n';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const me = (overrides: Partial<Me> = {}): Me => ({
  id: 'u', workspaceId: 'w', workspaceName: 'SOM', displayName: 'Staff', email: null, roles: ['EMPLOYEE'], permissions: [],
  employeeId: 'e', mustChangeCredential: false, phoneVerificationRequired: false, hasPassword: true, hasPin: false, locale: 'lo',
  ...overrides,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  usePrefsStore.setState({ locale: 'lo' });
  useAuthStore.setState({ accessToken: 'a', refreshToken: 'r', user: null });
});
afterEach(() => vi.restoreAllMocks());

describe('AccountSetup', () => {
  it('asks for phone verification before the credential change', () => {
    render(<AccountSetup user={me({ phoneVerificationRequired: true, mustChangeCredential: true })} />, { wrapper });
    expect(screen.getByTestId('setup-verify-phone')).toBeInTheDocument();
    expect(screen.queryByTestId('setup-change-credential')).not.toBeInTheDocument();
  });

  it('shows the password form for password users and the PIN form for PIN-only users', () => {
    const { rerender } = render(<AccountSetup user={me({ mustChangeCredential: true })} />, { wrapper });
    expect(screen.getByTestId('change-password-form')).toBeInTheDocument();
    rerender(<AccountSetup user={me({ mustChangeCredential: true, hasPassword: false, hasPin: true })} />);
    expect(screen.getByTestId('change-pin-form')).toBeInTheDocument();
    expect(screen.getByLabelText(/PIN ປັດຈຸບັນ/)).toBeInTheDocument();
  });
});

describe('ChangePinForm', () => {
  it('sets an initial PIN without asking for the current one', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/auth/me') ? json(me({ hasPin: true })) : new Response(null, { status: 204 }),
    );
    const onSuccess = vi.fn();
    render(<ChangePinForm hasPin={false} onSuccess={onSuccess} />, { wrapper });
    expect(screen.queryByLabelText(/PIN ປັດຈຸບັນ/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/PIN ໃໝ່/), '730261');
    await userEvent.click(screen.getByRole('button', { name: 'ຕັ້ງ PIN' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/auth\/change-pin$/);
    expect(JSON.parse(String(init!.body))).toEqual({ newPin: '730261' });
    expect(useAuthStore.getState().user?.hasPin).toBe(true);
  });
});

describe('ForgotPasswordForm', () => {
  it('shows the generic confirmation, then submits the reset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/forgot') ? json({ resendAfterSeconds: 60, maskedPhone: null }, 202) : new Response(null, { status: 204 }),
    );
    const onDone = vi.fn();
    render(<ForgotPasswordForm defaultWorkspaceCode="som-demo" onDone={onDone} />, { wrapper });
    await userEvent.type(screen.getByLabelText(/ລະຫັດພະນັກງານ, ເບີໂທ ຫຼື ອີເມວ/), 'E003');
    await userEvent.click(screen.getByRole('button', { name: 'ສົ່ງລະຫັດ' }));
    expect(await screen.findByTestId('forgot-sent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ສົ່ງໃໝ່ໄດ້ໃນ/ })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/ລະຫັດ SMS/), '123456');
    await userEvent.type(screen.getByLabelText(/ລະຫັດຜ່ານໃໝ່/), 'Brand9New');
    await userEvent.click(screen.getByRole('button', { name: 'ຕັ້ງລະຫັດໃໝ່' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const resetCall = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/auth/password/reset'))!;
    expect(JSON.parse(String(resetCall[1]!.body))).toEqual({ workspaceCode: 'som-demo', identifier: 'E003', code: '123456', newPassword: 'Brand9New' });
  });
});
