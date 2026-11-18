import { Redirect, router } from 'expo-router';
import { kioskApi } from '@/features/kiosk/api';
import { KioskEnrol } from '@/features/kiosk/KioskEnrol';
import { useKioskStore } from '@/features/kiosk/store';

/** Enrol the tablet with the code HR created (FR-ATT-03.1). */
export default function KioskEnrolRoute() {
  const enrolled = useKioskStore((s) => !!s.token && !!s.info);
  if (enrolled) return <Redirect href="/kiosk" />;
  return (
    <KioskEnrol
      verify={kioskApi.meWith}
      onEnrolled={(code, info) => {
        useKioskStore.getState().enrol(code, info);
        router.replace('/kiosk');
      }}
    />
  );
}
