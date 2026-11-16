'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, type NotificationFilters } from './api';

/** Poll interval of the unread badge. */
export const UNREAD_POLL_MS = 60_000;

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (f: NotificationFilters) => [...notificationKeys.all, 'list', f] as const,
  unread: () => [...notificationKeys.all, 'unread-count'] as const,
};

export const useNotifications = (filters: NotificationFilters) =>
  useQuery({ queryKey: notificationKeys.list(filters), queryFn: () => notificationsApi.list(filters), placeholderData: keepPreviousData });

export const useUnreadCount = (enabled = true) =>
  useQuery({ queryKey: notificationKeys.unread(), queryFn: notificationsApi.unreadCount, refetchInterval: UNREAD_POLL_MS, enabled });

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: notificationKeys.all });
};

export const useMarkRead = () => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => notificationsApi.markRead(id), onSuccess: invalidate });
};

export const useMarkAllRead = () => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate });
};
