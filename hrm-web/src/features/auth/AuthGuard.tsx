'use client';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Spinner } from '@/components/ui';
import { useHydrated } from '@/lib/use-hydrated';
import { useMeSync } from './hooks';
import { useAuthStore } from './store';

/** Redirects to /login when there is no session; renders children otherwise. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const token = useAuthStore((s) => s.accessToken);
  const router = useRouter();
  useMeSync();

  useEffect(() => {
    if (hydrated && !token) router.replace('/login');
  }, [hydrated, token, router]);

  if (!hydrated || !token) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-primary">
        <Spinner />
      </div>
    );
  }
  return <>{children}</>;
}
