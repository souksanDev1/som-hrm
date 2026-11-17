import type { NotificationItem, Paginated } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter } from '@/features/notifications/NotificationCenter';
import { usePrefsStore } from '@/lib/i18n';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const api = vi.hoisted(() => ({
  list: vi.fn(),
  unreadCount: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));
vi.mock('@/features/notifications/api', () => ({ notificationsApi: api }));

const item = (id: string, link: string | null, readAt: string | null = null): NotificationItem => ({
  id, type: 'DOCUMENT_EXPIRY', title: `Title ${id}`, body: `Body ${id}`, link, readAt, createdAt: '2026-11-16T02:00:00.000Z',
});

const renderCenter = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NotificationCenter />
    </QueryClientProvider>,
  );

beforeEach(() => {
  usePrefsStore.setState({ locale: 'en' });
  push.mockReset();
  const page: Paginated<NotificationItem> = {
    items: [item('a', '/employees/emp1'), item('b', '/profile'), item('c', 'https://evil.example', '2026-11-16T03:00:00.000Z')],
    total: 3, page: 1, pageSize: 20,
  };
  api.list.mockResolvedValue(page);
  api.markRead.mockImplementation(async (id: string) => ({ ...page.items.find((n) => n.id === id)!, readAt: '2026-11-16T04:00:00.000Z' }));
});

const openRow = async (title: string) => userEvent.click(await screen.findByRole('button', { name: new RegExp(title) }));

describe('NotificationCenter deep links (FR-NOTI-04.2)', () => {
  it('marks an unread notification read and opens its web screen through the shared mapping', async () => {
    renderCenter();
    await openRow('Title a');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/employees/emp1'));
    expect(api.markRead).toHaveBeenCalledWith('a');
  });

  it('stays on the list for links without a web screen or unsafe links', async () => {
    renderCenter();
    await openRow('Title b');
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('b'));
    await openRow('Title c');
    expect(api.markRead).not.toHaveBeenCalledWith('c'); // already read
    expect(push).not.toHaveBeenCalled();
  });
});
