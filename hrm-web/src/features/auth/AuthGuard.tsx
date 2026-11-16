'use client';
import { pendingAccountSetup } from '@hrm/shared';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Spinner } from '@/components/ui';
import { useHydrated } from '@/lib/use-hydrated';
import { useMeSync } from './hooks';
import { useAuthStore } from './store';

export const ACCOUNT_SETUP_PATH = '/account-setup';

/**
 * Redirects to /login when there is no session, and to the account-setup screen while the
 * user must verify their phone or replace a temporary credential (the API enforces the same
 * gate with 403s). Renders children otherwise.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const token = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const me = useMeSync();
  // Persisted `user` may be stale; wait for a fresh /auth/me before trusting its flags.
  const pending = me.data ? pendingAccountSetup(me.data) : user ? pendingAccountSetup(user) : null;

  useEffect(() => {
    if (!hydrated) return;
    if (!token) router.replace('/login');
    else if (pending) router.replace(ACCOUNT_SETUP_PATH);
  }, [hydrated, token, pending, router]);

  if (!hydrated || !token || pending) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-primary">
        <Spinner />
      </div>
    );
  }
  return <>{children}</>;
}
