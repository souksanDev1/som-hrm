import { Redirect } from 'expo-router';
import { KioskScreen } from '@/features/kiosk/KioskScreen';
import { useKioskStore } from '@/features/kiosk/store';

/** Kiosk idle screen + punch flow; not enrolled (or revoked) → enrol screen. */
export default function KioskRoute() {
  const token = useKioskStore((s) => s.token);
  const info = useKioskStore((s) => s.info);
  if (!token || !info) return <Redirect href="/kiosk-enrol" />;
  return <KioskScreen info={info} />;
}
