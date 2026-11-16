'use client';
import { pendingAccountSetup } from '@hrm/shared';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button, StateView } from '@/components/ui';
import { AccountSetup } from '@/features/auth/components/AccountSetup';
import { AuthScreen } from '@/features/auth/components/AuthScreen';
import { useLogout, useMeSync } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';
import { useHydrated } from '@/lib/use-hydrated';

/** Forced phone verification / credential change; every other page redirects here until done. */
export default function AccountSetupPage() {
  const t = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const token = useAuthStore((s) => s.accessToken);
  const me = useMeSync();
  const logout = useLogout();
  const user = me.data;
  const done = !!user && !pendingAccountSetup(user);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) router.replace('/login');
    else if (done) router.replace('/dashboard');
  }, [hydrated, token, done, router]);

  return (
    <AuthScreen
      title={t('authx.setup.title')}
      subtitle={user?.displayName}
      loading={!hydrated || !token || me.isPending || done}
      footer={
        <Button
          variant="ghost"
          size="sm"
          data-testid="logout"
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
        >
          {t('auth.logout')}
        </Button>
      }
    >
      {user ? (
        <AccountSetup user={user} />
      ) : (
        <StateView kind="error" title={t('state.error.title')} />
      )}
    </AuthScreen>
  );
}
