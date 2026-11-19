import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useT } from '@/lib/i18n';

/** Presentation only: the employee API does not currently expose a profile photo. */
export function EmployeeAvatar({ name, size = 72, testID }: { name?: string; size?: number; testID?: string }) {
  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={name}
      style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: '#E8ECF5', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
    >
      <MaterialIcons name="person-outline" size={size * 0.6} color="#65738E" />
    </View>
  );
}

/** Shared blue page chrome. Notification navigation stays on the existing route. */
export function EmployeeHeader({ title, back = false, unread = 0, onNotifications, testID }: {
  title: string;
  back?: boolean;
  unread?: number;
  onNotifications?: () => void;
  testID?: string;
}) {
  const t = useT();
  return (
    <View style={{ backgroundColor: '#2C3E91' }} testID={testID}>
      <View className="w-full max-w-[640px] flex-row items-center gap-3 self-center px-4 pb-4 pt-2">
        {back && (
          <Pressable testID={testID ? `${testID}-back` : 'header-back'} accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} className="h-11 w-11 items-center justify-center rounded-full active:bg-white/10">
            <MaterialIcons name="arrow-back" color="#FFFFFF" size={25} />
          </Pressable>
        )}
        <Text className="flex-1 text-xl font-bold text-white" numberOfLines={2}>{title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('nav.notifications')}${unread > 0 ? ` (${unread})` : ''}`}
          testID={testID ? `${testID}-notifications` : 'header-notifications'}
          onPress={onNotifications ?? (() => router.push('/notifications'))}
          className="h-12 w-12 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
        >
          <MaterialIcons name="notifications-none" color="#FFFFFF" size={28} />
          {unread > 0 && (
            <View className="absolute -right-1 -top-1 min-w-5 items-center rounded-full bg-danger px-1">
              <Text className="text-[10px] font-bold text-white" testID="header-unread-count">{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}
