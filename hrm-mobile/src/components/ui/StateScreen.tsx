import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useT } from '@/lib/i18n';
import { Button } from './Button';

/** Problem states field staff hit: no internet, outside the geofence, GPS off, pending sync, errors. */
export type StateKind = 'offline' | 'outOfZone' | 'gpsOff' | 'syncPending' | 'error' | 'empty' | 'forbidden';

const config: Record<StateKind, { icon: keyof typeof MaterialIcons.glyphMap; color: string; title: string; body?: string }> = {
  offline: { icon: 'wifi-off', color: '#F79009', title: 'state.offline.title', body: 'state.offline.body' },
  outOfZone: { icon: 'wrong-location', color: '#F04438', title: 'state.outOfZone.title', body: 'state.outOfZone.body' },
  gpsOff: { icon: 'location-disabled', color: '#F04438', title: 'state.gpsOff.title', body: 'state.gpsOff.body' },
  syncPending: { icon: 'cloud-upload', color: '#1F5FD6', title: 'state.syncPending.title', body: 'state.offline.body' },
  error: { icon: 'error-outline', color: '#F04438', title: 'state.error.title', body: 'state.error.body' },
  empty: { icon: 'inbox', color: '#667085', title: 'common.empty' },
  forbidden: { icon: 'lock-outline', color: '#667085', title: 'state.forbidden.title' },
};

export interface StateScreenProps {
  kind: StateKind;
  onRetry?(): void;
  /** Optional extra action, e.g. "request time correction" when out of zone. */
  action?: { label: string; onPress(): void };
}

export function StateScreen({ kind, onRetry, action }: StateScreenProps) {
  const t = useT();
  const c = config[kind];
  return (
    <View testID={`state-${kind}`} accessibilityRole={kind === 'error' ? 'alert' : 'summary'} className="flex-1 items-center justify-center gap-3 px-6 py-12">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
        <MaterialIcons name={c.icon} size={32} color={c.color} />
      </View>
      <Text className="text-center text-lg font-semibold text-ink dark:text-night-ink">{t(c.title)}</Text>
      {c.body ? <Text className="text-center text-sm text-ink-muted">{t(c.body)}</Text> : null}
      <View className="mt-2 w-full max-w-xs gap-2">
        {onRetry ? <Button title={t('common.retry')} variant="secondary" onPress={onRetry} testID="state-retry" /> : null}
        {action ? <Button title={action.label} onPress={action.onPress} /> : null}
      </View>
    </View>
  );
}
