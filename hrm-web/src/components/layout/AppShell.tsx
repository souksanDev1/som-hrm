'use client';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { MobileTabBar } from './MobileTabBar';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { visibleNav } from './nav';

export function AppShell({ children }: { children: ReactNode }) {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const items = visibleNav(permissions);
  return (
    <div className="flex min-h-dvh bg-canvas dark:bg-night-canvas">
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 sm:px-6 lg:pb-8">{children}</main>
      </div>
      <MobileTabBar items={items} />
    </div>
  );
}
