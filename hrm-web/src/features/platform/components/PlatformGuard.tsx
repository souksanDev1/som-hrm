'use client';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Spinner } from '@/components/ui';
import { usePlatformMeSync } from '../hooks';
import { usePlatformAuthStore, usePlatformHydrated } from '../store';

/** Redirects to /platform/login when there is no platform session. Independent of the tenant session. */
export function PlatformGuard({ children }: { children: ReactNode }) {
  const hydrated = usePlatformHydrated();
  const token = usePlatformAuthStore((s) => s.accessToken);
  const router = useRouter();
  usePlatformMeSync();

  useEffect(() => {
    if (hydrated && !token) router.replace('/platform/login');
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
