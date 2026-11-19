import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { useMyProfile } from '@/features/employees/hooks';
import { usePrefsStore } from '@/lib/i18n';
import AccountPage from '@/app/(app)/account/page';

// The account page's other cards have their own tests and queries; only the line manager card matters here.
vi.mock('@/features/approvals/components/DelegationsCard', () => ({ DelegationsCard: () => null }));
vi.mock('@/features/auth/components/ChangePasswordForm', () => ({ ChangePasswordForm: () => null }));
vi.mock('@/features/auth/components/ChangePinForm', () => ({ ChangePinForm: () => null }));
vi.mock('@/features/auth/components/LanguageSelect', () => ({ LanguageSelect: () => null }));

const withClient = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
/** Default client options on purpose: the hook's own `retry` decides whether a failure is retried. */
const newClient = () => new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const error = (status: number, code: string) => json({ error: { code, message: code } }, status);

beforeEach(() => {
  usePrefsStore.setState({ locale: 'lo' });
  useAuthStore.setState({ accessToken: 'a', refreshToken: 'r', user: null });
});
afterEach(() => vi.restoreAllMocks());

describe('useMyProfile', () => {
  it('turns 404 no_employee_profile into null', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => error(404, 'no_employee_profile'));
    const { result } = renderHook(() => useMyProfile(), { wrapper: withClient(newClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('does not retry a 403, even where the client would retry by default', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => error(403, 'forbidden'));
    const { result } = renderHook(() => useMyProfile(), { wrapper: withClient(newClient()) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('account page line manager card', () => {
  it('shows the card with the manager and the department', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json({ manager: { id: 'm1', name: 'ບົວພັນ ສີສຸວັນ', positionName: 'Lead' }, isTopLevel: false, department: { id: 'd1', name: 'Ops' } }),
    );
    render(<AccountPage />, { wrapper: withClient(newClient()) });
    expect(await screen.findByTestId('line-manager')).toHaveTextContent('ບົວພັນ ສີສຸວັນ');
    expect(screen.getByTestId('line-manager')).toHaveTextContent('Ops');
  });

  it('renders no card for a login without an employee profile', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => error(404, 'no_employee_profile'));
    const client = newClient();
    render(<AccountPage />, { wrapper: withClient(client) });
    await waitFor(() => expect(client.getQueryState(['employees', 'me'])?.status).toBe('success'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('line-manager')).toBeNull();
    expect(screen.getByText('ພາສາ')).toBeInTheDocument();
  });
});
