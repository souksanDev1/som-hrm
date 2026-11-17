import type { NotificationItem, Paginated, UnreadCount } from '@hrm/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const PAGE_SIZE = 20;
export const notificationKeys = { all: ['notifications'] as const };

export const notificationsApi = {
  list: (page: number, unread: boolean) =>
    apiFetch<Paginated<NotificationItem>>('/notifications', { query: { page, pageSize: PAGE_SIZE, unread: unread ? 'true' : undefined } }),
  unreadCount: () => apiFetch<UnreadCount>('/notifications/unread-count'),
  markRead: (id: string) => apiFetch<NotificationItem>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => apiFetch<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
};

export const useNotificationList = (unread: boolean) =>
  useInfiniteQuery({
    queryKey: [...notificationKeys.all, 'list', unread],
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam, unread),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

export const useUnreadCount = (enabled = true) =>
  useQuery({ queryKey: [...notificationKeys.all, 'unread-count'], queryFn: notificationsApi.unreadCount, refetchInterval: 60_000, enabled });

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: notificationKeys.all });
};

export const useMarkRead = () => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: notificationsApi.markRead, onSuccess: invalidate });
};

export const useMarkAllRead = () => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate });
};

