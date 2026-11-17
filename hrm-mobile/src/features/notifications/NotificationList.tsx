import { NOTIFICATIONS_ROUTE, resolveNotificationLink, type NotificationItem } from '@hrm/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Button, QueryView, Segmented, StateScreen } from '@/components/ui';
import { useT, usePrefsStore } from '@/lib/i18n';
import { useMarkAllRead, useMarkRead, useNotificationList } from './api';

type Filter = 'all' | 'unread';

/** Notification inbox: pull to refresh, unread filter, tap to mark read and open the linked screen. */
export function NotificationList() {
  const t = useT();
  const router = useRouter();
  const locale = usePrefsStore((s) => s.locale);
  const [filter, setFilter] = useState<Filter>('all');
  const query = useNotificationList(filter === 'unread');
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const open = (n: NotificationItem) => {
    if (!n.readAt) markRead.mutate(n.id);
    // Shared link mapping (FR-NOTI-04.2); links without a mobile screen keep the user on this list.
    const route = resolveNotificationLink(n.link, 'mobile');
    if (route && route !== NOTIFICATIONS_ROUTE) router.push(route);
  };
  const formatTime = (iso: string) => new Date(iso).toLocaleString(locale === 'lo' ? 'lo-LA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <View className="flex-1 gap-3">
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('notif.filter.all'), testID: 'notif-filter-all' },
          { value: 'unread', label: t('notif.filter.unread'), testID: 'notif-filter-unread' },
        ]}
      />
      <Button title={t('notif.markAllRead')} variant="secondary" loading={markAll.isPending} onPress={() => markAll.mutate()} testID="notif-mark-all" />
      <QueryView query={{ ...query, data: query.data?.pages }}>
        {(pages) => {
          const items = pages.flatMap((p) => p.items);
          return (
            <FlatList
              data={items}
              keyExtractor={(n) => n.id}
              testID="notification-list"
              refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
              onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && void query.fetchNextPage()}
              ListEmptyComponent={<StateScreen kind="empty" />}
              ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator className="py-4" /> : null}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => open(item)}
                  accessibilityRole="button"
                  accessibilityHint={item.readAt ? undefined : t('notif.markRead')}
                  testID="notification-row"
                  className="flex-row gap-3 border-b border-line py-3 dark:border-night-line"
                >
                  <View className={`mt-1.5 h-2 w-2 rounded-full ${item.readAt ? 'bg-transparent' : 'bg-primary'}`} />
                  <View className="flex-1">
                    <Text className={`text-sm text-ink dark:text-night-ink ${item.readAt ? '' : 'font-semibold'}`}>{item.title}</Text>
                    <Text className="text-sm text-ink-muted">{item.body}</Text>
                    <Text className="text-xs text-ink-muted">{formatTime(item.createdAt)}</Text>
                  </View>
                </Pressable>
              )}
            />
          );
        }}
      </QueryView>
    </View>
  );
}
