import type { NotificationItem, Paginated, UnreadCount } from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

export interface NotificationFilters {
  page: number;
  pageSize?: number;
  unread?: boolean;
}

export const notificationsApi = {
  list: ({ page, pageSize = 20, unread }: NotificationFilters) =>
    apiFetch<Paginated<NotificationItem>>('/notifications', { query: { page, pageSize, unread: unread ? 'true' : undefined } }),
  unreadCount: () => apiFetch<UnreadCount>('/notifications/unread-count'),
  markRead: (id: string) => apiFetch<NotificationItem>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => apiFetch<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
};
