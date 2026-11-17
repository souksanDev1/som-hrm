import type { NotificationItem, Paginated } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { NotificationList } from '@/features/notifications/NotificationList';
import { usePrefsStore } from '@/lib/i18n';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), router: { push: jest.fn() } }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })}>
    {children}
  </QueryClientProvider>
);

const item = (id: string, link: string | null): NotificationItem => ({
  id, type: 'DOCUMENT_EXPIRY', title: `Title ${id}`, body: `Body ${id}`, link, readAt: null, createdAt: '2026-11-16T02:00:00.000Z',
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  usePrefsStore.setState({ locale: 'en' });
  useAuthStore.setState({ accessToken: 'a', refreshToken: 'r' });
  mockPush.mockReset();
});
afterEach(() => jest.restoreAllMocks());

describe('NotificationList tap → screen (FR-NOTI-04.2)', () => {
  it('marks the item read and opens the linked mobile screen; links without a mobile screen stay on the list', async () => {
    const page: Paginated<NotificationItem> = { items: [item('own', '/profile'), item('hr', '/employees/abc')], total: 2, page: 1, pageSize: 20 };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input) => (String(input).includes('/read') ? json({ ...page.items[0], readAt: '2026-11-16T03:00:00.000Z' }) : json(page)));
    render(<NotificationList />, { wrapper });

    fireEvent.press(await screen.findByText('Title own'));
    expect(mockPush).toHaveBeenCalledWith('/profile');
    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([url, init]) => String(url).endsWith('/notifications/own/read') && init?.method === 'POST')).toBe(true),
    );

    fireEvent.press(screen.getByText('Title hr'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    // Both taps mark read and refresh the list; let those requests settle.
    await waitFor(() => expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes('/read'))).toHaveLength(2));
    await waitFor(() => expect(fetchSpy.mock.calls.filter(([url]) => !String(url).includes('/read')).length).toBeGreaterThanOrEqual(3));
  });
});
