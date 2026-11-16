import type { ReactNode } from 'react';
import { PlatformGuard } from '@/features/platform/components/PlatformGuard';
import { PlatformShell } from '@/features/platform/components/PlatformShell';

/** SOM platform console — separate session, guard and layout from the tenant app. */
export default function PlatformConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <PlatformGuard>
      <PlatformShell>{children}</PlatformShell>
    </PlatformGuard>
  );
}
