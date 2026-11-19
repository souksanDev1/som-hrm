import Image from 'next/image';
import { cn } from '@/lib/cn';

/** Brand "S" mark on a white tile (readable on light, dark and sidebar backgrounds). */
export function BrandMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-md bg-white shadow-sm ring-1 ring-black/5', className)}
      style={{ width: size, height: size }}
    >
      <Image src="/brand/logo-mark.png" alt="" width={Math.round(size * 0.78)} height={Math.round(size * 0.78)} priority />
    </span>
  );
}

/** Full Tech Solutions logo (mark + wordmark). Sits on a white plate so the dark wordmark stays legible in dark mode. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center', className)}>
      <span className="rounded-lg px-4 py-2 dark:bg-white">
        <Image src="/brand/logo-full.png" alt="Tech Solutions HRM" width={600} height={537} priority className="h-28 w-auto" />
      </span>
    </div>
  );
}
