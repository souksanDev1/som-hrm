import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/ui';
import { LoginForm } from '@/features/auth/LoginForm';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore, useT } from '@/lib/i18n';

export default function LoginScreen() {
  const t = useT();
  const { locale, setLocale } = usePrefsStore();
  const lastWorkspaceCode = useAuthStore((s) => s.lastWorkspaceCode);
  const lastMethod = useAuthStore((s) => s.lastLoginMethod);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <Screen testID="login-screen">
        <View className="flex-1 justify-center gap-6">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-md bg-primary">
                <Text className="text-xl font-bold text-white">S</Text>
              </View>
              <View>
                <Text className="text-xl font-semibold text-ink dark:text-night-ink">{t('auth.title')}</Text>
                <Text className="text-xs text-ink-muted">{t('auth.subtitle')}</Text>
              </View>
            </View>
            <Pressable accessibilityRole="button" testID="toggle-locale" onPress={() => setLocale(locale === 'lo' ? 'en' : 'lo')} className="min-h-12 justify-center px-3">
              <Text className="font-medium text-primary">{locale === 'lo' ? 'EN' : 'ລາວ'}</Text>
            </Pressable>
          </View>
          <View className="rounded-lg border border-line bg-white p-5 dark:border-night-line dark:bg-night-surface">
            <LoginForm
              defaultWorkspaceCode={lastWorkspaceCode}
              defaultMethod={lastMethod}
              onSuccess={() => {
                const user = useAuthStore.getState().user;
                router.replace(user?.mustChangeCredential ? '/change-pin' : '/home');
              }}
            />
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
