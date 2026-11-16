import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Button, Card, Screen } from '@/components/ui';
import { ForgotForm } from '@/features/auth/ForgotForm';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';

export default function ForgotScreen() {
  const t = useT();
  const lastWorkspaceCode = useAuthStore((s) => s.lastWorkspaceCode);
  const [done, setDone] = useState(false);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <Screen testID="forgot-screen">
        <View className="gap-4">
          <Text className="text-xl font-semibold text-ink dark:text-night-ink">{t('authx.forgot.title')}</Text>
          <Card>
            {done ? (
              <Text testID="reset-done" className="text-sm text-ink dark:text-night-ink">{t('authx.forgot.done')}</Text>
            ) : (
              <ForgotForm defaultWorkspaceCode={lastWorkspaceCode} onDone={() => setDone(true)} />
            )}
          </Card>
          <Button title={t('authx.forgot.backToLogin')} variant="ghost" onPress={() => router.replace('/login')} testID="back-to-login" />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
