import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Card, Screen } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';

type IconName = keyof typeof MaterialIcons.glyphMap;

const shortcuts: { titleKey: string; route: string; icon: IconName; chip: string; color: string; testID?: string }[] = [
  { titleKey: 'nav.profile', route: '/profile', icon: 'person-outline', chip: 'bg-sky-50', color: '#0284C7' },
  { titleKey: 'nav.org', route: '/org', icon: 'account-tree', chip: 'bg-violet-50', color: '#7C3AED' },
  { titleKey: 'nav.approvals', route: '/approvals', icon: 'fact-check', chip: 'bg-emerald-50', color: '#059669', testID: 'open-approvals' },
  { titleKey: 'otx.mine.title', route: '/overtime', icon: 'schedule', chip: 'bg-rose-50', color: '#E11D48', testID: 'open-overtime' },
  { titleKey: 'nav.leave', route: '/leave', icon: 'event-busy', chip: 'bg-amber-50', color: '#D97706', testID: 'open-leave' },
  { titleKey: 'lcal.title', route: '/leave-calendar', icon: 'calendar-month', chip: 'bg-indigo-50', color: '#4F46E5', testID: 'open-leave-calendar' },
];

/** Faux-gradient hero: layered translucent circles over the brand colour (no native gradient dep). */
function HeroGreeting({ name, org }: { name?: string; org?: string }) {
  return (
    <View className="mb-4 overflow-hidden rounded-2xl bg-primary p-5 shadow-sm">
      <View className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
      <View className="absolute -bottom-12 right-10 h-32 w-32 rounded-full bg-white/10" />
      <Text className="text-sm text-white/80">{org}</Text>
      <Text className="mt-1 text-2xl font-bold text-white" testID="home-greeting">
        {name ?? '…'}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  return (
    <Screen testID="home-screen">
      <HeroGreeting name={user?.displayName} org={user?.workspaceName} />
      <Card title={t('nav.dashboard')}>
        <View className="flex-row flex-wrap gap-3">
          {shortcuts.map((s) => (
            <Pressable
              key={s.route}
              accessibilityRole="button"
              testID={s.testID}
              onPress={() => router.push(s.route)}
              className="w-[30%] grow items-center gap-2 rounded-lg bg-canvas px-2 py-4 active:bg-primary-soft dark:bg-night-canvas"
            >
              <View className={`h-11 w-11 items-center justify-center rounded-md ${s.chip}`}>
                <MaterialIcons name={s.icon} size={22} color={s.color} />
              </View>
              <Text className="text-center text-xs font-medium text-ink dark:text-night-ink">{t(s.titleKey)}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
