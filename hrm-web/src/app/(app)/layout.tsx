import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from '@/features/auth/AuthGuard';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
