import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Card, Screen } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';

export default function HomeScreen() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  return (
    <Screen testID="home-screen">
      <Text className="text-sm text-ink-muted">{user?.workspaceName}</Text>
      <Text className="mb-4 text-2xl font-semibold text-ink dark:text-night-ink" testID="home-greeting">
        {user?.displayName ?? '…'}
      </Text>
      <Card title={t('nav.profile')}>
        <View className="gap-2">
          <Button title={t('nav.profile')} variant="secondary" onPress={() => router.push('/profile')} />
          <Button title={t('nav.org')} variant="secondary" onPress={() => router.push('/org')} />
        </View>
      </Card>
    </Screen>
  );
}
