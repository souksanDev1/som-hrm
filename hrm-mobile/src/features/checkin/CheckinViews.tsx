import { MaterialIcons } from '@expo/vector-icons';
import { interpolate, type CheckinStatus, type MyPunch, type PunchKind } from '@hrm/shared';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, TextField, type BadgeTone } from '@/components/ui';
import { useT } from '@/lib/i18n';
import type { QueuedPunch } from './queue';
import { dateTimeOf, type ZoneState } from './zone';

type IconName = keyof typeof MaterialIcons.glyphMap;

const ZONE_LOOK: Record<ZoneState['kind'], { icon: IconName; color: string }> = {
  disabled: { icon: 'block', color: '#667085' },
  denied: { icon: 'location-disabled', color: '#F04438' },
  off: { icon: 'location-disabled', color: '#F04438' },
  locating: { icon: 'my-location', color: '#1F5FD6' },
  mocked: { icon: 'gpp-bad', color: '#F04438' },
  lowAccuracy: { icon: 'gps-not-fixed', color: '#F79009' },
  inside: { icon: 'where-to-vote', color: '#12B76A' },
  noGeofence: { icon: 'place', color: '#1F5FD6' },
  outside: { icon: 'wrong-location', color: '#F04438' },
  outsideOffsite: { icon: 'share-location', color: '#F79009' },
  unknown: { icon: 'place', color: '#667085' },
};

/** One line describing the location state; `testID` = `checkin-zone-<kind>`. */
export function zoneMessage(t: (k: string) => string, zone: ZoneState): string {
  switch (zone.kind) {
    case 'disabled':
      return t('checkin.state.disabled');
    case 'denied':
      return t('checkin.state.permissionDenied');
    case 'off':
      return t('state.gpsOff.body');
    case 'locating':
      return t('checkin.state.locating');
    case 'mocked':
      return t('checkin.state.mocked');
    case 'lowAccuracy':
      return interpolate(t('checkin.state.lowAccuracy'), { metres: zone.accuracyMetres });
    case 'inside':
      return t('checkin.state.inside');
    case 'noGeofence':
      return t('checkin.state.noGeofence');
    case 'outside':
      return interpolate(t('checkin.state.outside'), { metres: zone.distanceMetres });
    case 'outsideOffsite':
      return interpolate(t('checkin.state.outsideOffsite'), { metres: zone.distanceMetres });
    case 'unknown':
      return t('state.offline.body');
  }
}

export interface ZoneCardProps {
  status: CheckinStatus | null;
  zone: ZoneState;
  accuracyMetres: number | null;
  onRetry?(): void;
}

/** Branch, today's shift and the live location state (distance, accuracy). */
export function ZoneCard({ status, zone, accuracyMetres, onRetry }: ZoneCardProps) {
  const t = useT();
  const look = ZONE_LOOK[zone.kind];
  const distance = zone.kind === 'inside' ? zone.distanceMetres : zone.kind === 'outside' || zone.kind === 'outsideOffsite' ? zone.distanceMetres : null;
  return (
    <Card testID="checkin-zone-card">
      {status?.branch ? (
        <Text className="text-base font-semibold text-ink dark:text-night-ink" testID="checkin-branch">
          {status.branch.name}
        </Text>
      ) : null}
      <Text className="mb-3 text-sm text-ink-muted" testID="checkin-shift">
        {status?.shift ? interpolate(t('checkin.shift'), { start: status.shift.startTime, end: status.shift.endTime }) : status ? t('checkin.noShift') : ''}
      </Text>
      <View className="flex-row items-start gap-3" testID={`checkin-zone-${zone.kind}`}>
        <MaterialIcons name={look.icon} size={28} color={look.color} />
        <View className="flex-1 gap-1">
          <Text className="text-base font-medium text-ink dark:text-night-ink" testID="checkin-zone-message">
            {zoneMessage(t, zone)}
          </Text>
          {distance !== null ? (
            <Text className="text-sm text-ink-muted" testID="checkin-distance">
              {interpolate(t('attendance.distance'), { metres: distance })}
              {status?.branch ? ` · ${interpolate(t('checkin.zoneRadius'), { metres: status.branch.geofenceRadius })}` : ''}
            </Text>
          ) : null}
          {accuracyMetres !== null ? (
            <Text className="text-xs text-ink-muted" testID="checkin-accuracy">
              {interpolate(t('checkin.accuracy'), { metres: Math.round(accuracyMetres) })}
            </Text>
          ) : null}
        </View>
      </View>
      {onRetry && (zone.kind === 'lowAccuracy' || zone.kind === 'off' || zone.kind === 'denied' || zone.kind === 'outside') ? (
        <View className="mt-3">
          <Button title={t('checkin.retryLocation')} variant="secondary" onPress={onRetry} testID="checkin-retry-location" />
        </View>
      ) : null}
    </Card>
  );
}

/** The big IN/OUT button (64pt+ target for gloved hands). */
export function PunchButton({ kind, disabled, loading, onPress }: { kind: PunchKind; disabled?: boolean; loading?: boolean; onPress(): void }) {
  const t = useT();
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      testID="checkin-button"
      className={`h-44 w-44 items-center justify-center self-center rounded-full ${kind === 'IN' ? 'bg-primary active:bg-primary-dark' : 'bg-success active:opacity-90'} ${off ? 'opacity-50' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="large" />
      ) : (
        <>
          <MaterialIcons name={kind === 'IN' ? 'login' : 'logout'} size={40} color="#fff" />
          <Text className="mt-2 text-lg font-semibold text-white" testID="checkin-button-label">
            {t(`checkin.punch.${kind}`)}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export type MessageTone = 'success' | 'warning' | 'danger';
const MESSAGE_BOX: Record<MessageTone, string> = {
  success: 'bg-success-soft border-success/30',
  warning: 'bg-warning-soft border-warning/30',
  danger: 'bg-danger-soft border-danger/30',
};

export function Notice({ tone, text, testID, action }: { tone: MessageTone; text: string; testID?: string; action?: { label: string; onPress(): void; testID?: string } }) {
  return (
    <View testID={testID} accessibilityRole={tone === 'danger' ? 'alert' : 'text'} className={`mb-4 rounded-md border p-3 ${MESSAGE_BOX[tone]}`}>
      <Text className="text-sm text-ink dark:text-night-ink">{text}</Text>
      {action ? (
        <View className="mt-2">
          <Button title={action.label} variant="secondary" onPress={action.onPress} testID={action.testID} />
        </View>
      ) : null}
    </View>
  );
}

/** Reason sheet for an out-of-zone punch under an off-site permission (FR-ATT-16.2). */
export function OffsiteReasonSheet({ visible, onSubmit, onCancel }: { visible: boolean; onSubmit(reason: string): void; onCancel(): void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="gap-3 rounded-t-lg bg-white p-4 dark:bg-night-surface" testID="offsite-sheet">
          <Text className="text-lg font-semibold text-ink dark:text-night-ink">{t('checkin.offsite.title')}</Text>
          <Text className="text-sm text-ink-muted">{t('checkin.offsite.hint')}</Text>
          <TextField label={t('checkin.offsite.reason')} required value={reason} onChangeText={setReason} maxLength={500} multiline testID="offsite-reason-input" />
          <Button
            title={t('checkin.offsite.submit')}
            disabled={!trimmed}
            onPress={() => {
              onSubmit(trimmed);
              setReason('');
            }}
            testID="offsite-submit"
          />
          <Button title={t('common.cancel')} variant="ghost" onPress={onCancel} testID="offsite-cancel" />
        </View>
      </View>
    </Modal>
  );
}

/** Front-camera selfie for `attendance.selfieRequired` (FR-ATT-12); returns the local photo URI. */
export function SelfieCapture({ visible, onCaptured, onCancel }: { visible: boolean; onCaptured(uri: string): void; onCancel(): void }) {
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [taking, setTaking] = useState(false);
  const take = async () => {
    setTaking(true);
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.5, skipProcessing: true });
      if (photo?.uri) onCaptured(photo.uri);
    } finally {
      setTaking(false);
    }
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View className="flex-1 bg-black" testID="selfie-capture">
        {permission?.granted ? (
          <CameraView ref={camera} style={{ flex: 1 }} facing="front" />
        ) : (
          <View className="flex-1 items-center justify-center gap-4 px-6">
            <Text className="text-center text-base text-white">{t('checkin.selfie.permission')}</Text>
            <Button title={t('checkin.selfie.grant')} onPress={() => void requestPermission()} testID="selfie-grant" />
          </View>
        )}
        <View className="gap-2 bg-black p-4">
          <Button title={t('checkin.selfie.take')} loading={taking} disabled={!permission?.granted} onPress={() => void take()} testID="selfie-take" />
          <Button title={t('common.cancel')} variant="secondary" onPress={onCancel} testID="selfie-cancel" />
        </View>
      </View>
    </Modal>
  );
}

const REVIEW_TONE: Record<string, BadgeTone> = { PENDING: 'warning', REJECTED: 'danger', APPROVED: 'success' };

/**
 * Recent punches (FR-ATT-06): unsent and refused ones from the phone queue first, then the server's, each
 * labelled "offline record" with the time it actually reached the server.
 */
export function RecordList({ queued, punches, timeZone, onDismiss }: { queued: readonly QueuedPunch[]; punches: readonly MyPunch[]; timeZone: string; onDismiss(clientRef: string): void }) {
  const t = useT();
  if (!queued.length && !punches.length) return null;
  return (
    <Card title={t('checkin.records')} testID="checkin-records">
      {[...queued].reverse().map((q) => (
        <View key={q.clientRef} className="gap-1 border-b border-line py-2.5 dark:border-night-line" testID={`checkin-queued-${q.clientRef}`}>
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-sm font-medium text-ink dark:text-night-ink">
              {t(`attendance.kind.${q.kind}`)} · {dateTimeOf(q.capturedAt, timeZone)}
            </Text>
            <Badge label={t(q.status === 'rejected' ? 'checkin.record.rejected' : 'checkin.record.waiting')} tone={q.status === 'rejected' ? 'danger' : 'primary'} />
          </View>
          {q.status === 'rejected' ? (
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-xs text-danger">{t(q.error ?? 'unknown')}</Text>
              <Button title={t('checkin.record.dismiss')} variant="ghost" onPress={() => onDismiss(q.clientRef)} testID={`checkin-dismiss-${q.clientRef}`} />
            </View>
          ) : null}
        </View>
      ))}
      {punches.map((p) => (
        <View key={p.id} className="gap-1 border-b border-line py-2.5 dark:border-night-line" testID={`checkin-record-${p.id}`}>
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-sm font-medium text-ink dark:text-night-ink">
              {t(`attendance.kind.${p.kind}`)} · {dateTimeOf(p.capturedAt, timeZone)}
            </Text>
            <View className="flex-row gap-1">
              {p.offline ? <Badge label={t('attendance.offline')} tone="warning" testID={`checkin-offline-${p.id}`} /> : null}
              {p.offsite ? <Badge label={t('checkin.record.offsite')} tone="primary" /> : null}
              {p.reviewStatus !== 'NONE' ? <Badge label={t(`attendance.review.${p.reviewStatus}`)} tone={REVIEW_TONE[p.reviewStatus] ?? 'neutral'} /> : null}
            </View>
          </View>
          {p.offline ? (
            <Text className="text-xs text-ink-muted" testID={`checkin-received-${p.id}`}>
              {interpolate(t('attendance.receivedAt'), { time: dateTimeOf(p.receivedAt, timeZone) })}
            </Text>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

