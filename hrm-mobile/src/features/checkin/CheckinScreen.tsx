import { addDays, interpolate, isoDateInTimeZone, type PunchKind } from '@hrm/shared';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Screen, StateScreen } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';
import { checkinApi, useMyPunches } from './api';
import { Notice, OffsiteReasonSheet, PunchButton, RecordList, SelfieCapture, ZoneCard, zoneMessage, type MessageTone } from './CheckinViews';
import { getDeviceInfo, newId } from './device';
import { useCheckinContext, useOfflineOverdue } from './hooks';
import { currentFix, locationBlocker, watchFix, type Fix, type FixState } from './location';
import { getQueueStore } from './queue';
import { syncNow, useCheckinQueue } from './sync';
import { canPunch, nextKindFor, timeOf, zoneState } from './zone';

const DEFAULT_TIME_ZONE = 'Asia/Vientiane';
/** A live reading younger than this is reused for the punch instead of asking the GPS again. */
const FRESH_FIX_MS = 30_000;
const RECENT_DAYS = 7;

interface Draft {
  kind: PunchKind;
  fix: Fix;
  offsite: boolean;
  reason?: string;
  selfieUri?: string;
}

/**
 * Mobile check-in (FR-ATT-01/05–09/15/16.2): live distance to the branch, the IN/OUT button, off-site reason,
 * selfie, offline queue state and recent records. Every rule is enforced again by the API.
 */
export function CheckinScreen() {
  const t = useT();
  const qc = useQueryClient();
  const net = useNetInfo();
  const hasEmployee = !!useAuthStore((s) => s.user?.employeeId);
  const { query, status } = useCheckinContext(hasEmployee);
  const queue = useCheckinQueue((s) => s.items);
  const syncing = useCheckinQueue((s) => s.syncing);
  const timeZone = status?.timeZone ?? DEFAULT_TIME_ZONE;
  const today = isoDateInTimeZone(timeZone);
  const punches = useMyPunches(addDays(today, -(RECENT_DAYS - 1)), today, hasEmployee);

  const [fix, setFix] = useState<FixState>({ kind: 'locating' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState<'idle' | 'reason' | 'selfie' | 'busy'>('idle');
  const [message, setMessage] = useState<{ tone: MessageTone; text: string } | null>(null);

  const locate = useCallback(async () => {
    const blocker = await locationBlocker().catch(() => 'off' as const);
    if (blocker) {
      setFix({ kind: blocker });
      return null;
    }
    try {
      const f = await currentFix();
      setFix({ kind: 'ok', fix: f });
      return f;
    } catch {
      setFix({ kind: 'error' });
      return null;
    }
  }, []);

  // Watch the position only while this tab is focused (battery).
  useFocusEffect(
    useCallback(() => {
      let live = true;
      let sub: { remove(): void } | null = null;
      void (async () => {
        if ((await locate()) === null || !live) return;
        const s = await watchFix((f) => live && setFix({ kind: 'ok', fix: f })).catch(() => null);
        if (live) sub = s;
        else s?.remove();
      })();
      return () => {
        live = false;
        sub?.remove();
      };
    }, [locate]),
  );

  useEffect(() => {
    void useCheckinQueue.getState().refresh();
  }, []);

  const zone = zoneState(status, fix);
  const kind = nextKindFor(status, queue, new Date());
  const pending = queue.filter((q) => q.status === 'pending');
  const overdue = useOfflineOverdue(status, queue);

  /** Store the punch on the phone, then try to send it right away. */
  const record = async (d: Draft) => {
    setStep('busy');
    const clientRef = newId();
    const capturedAt = new Date().toISOString();
    try {
      const store = await getQueueStore();
      await store.add({
        clientRef,
        userId: useAuthStore.getState().user!.id,
        kind: d.kind,
        capturedAt,
        latitude: d.fix.latitude,
        longitude: d.fix.longitude,
        accuracyMetres: d.fix.accuracyMetres,
        offline: false,
        offsiteReason: d.reason ?? null,
        selfieUri: d.selfieUri ?? null,
        selfieFileId: null,
        status: 'pending',
        error: null,
      });
      await useCheckinQueue.getState().refresh();
      const outcome = await syncNow();
      const accepted = outcome.accepted.find((r) => r.clientRef === clientRef);
      const rejected = outcome.rejected.find((r) => r.clientRef === clientRef);
      if (accepted?.punch) {
        const text = interpolate(t('checkin.done'), { kind: t(`attendance.kind.${d.kind}`), time: timeOf(accepted.punch.capturedAt, timeZone) });
        setMessage({ tone: accepted.punch.reviewStatus === 'PENDING' ? 'warning' : 'success', text: accepted.punch.reviewStatus === 'PENDING' ? `${text} · ${t('checkin.pendingReview')}` : text });
        await qc.invalidateQueries({ queryKey: ['checkin'] });
      } else if (rejected) {
        setMessage({ tone: 'danger', text: t(rejected.error ?? 'unknown') });
      } else {
        setMessage({ tone: 'warning', text: t('checkin.queued') });
      }
    } finally {
      setDraft(null);
      setStep('idle');
    }
  };

  /** Next missing piece of the punch: off-site reason, then selfie, then record. */
  const advance = (d: Draft) => {
    setDraft(d);
    if (d.offsite && !d.reason) return setStep('reason');
    if (status?.selfieRequired && !d.selfieUri) return setStep('selfie');
    void record(d);
  };

  const onPunch = async () => {
    setMessage(null);
    setStep('busy');
    const fresh = fix.kind === 'ok' && Date.now() - fix.fix.at < FRESH_FIX_MS ? fix.fix : await locate();
    if (!fresh) return setStep('idle');
    const z = zoneState(status, { kind: 'ok', fix: fresh });
    if (z.kind === 'mocked') {
      // Blocked here; when online the server also records the attempt in its audit log (FR-ATT-09.2).
      setMessage({ tone: 'danger', text: t('checkin.state.mocked') });
      const device = await getDeviceInfo();
      if (device && net.isConnected) {
        void checkinApi
          .submit({ ...device, deviceSentAt: new Date().toISOString(), items: [{ clientRef: newId(), kind, capturedAt: new Date().toISOString(), latitude: fresh.latitude, longitude: fresh.longitude, accuracyMetres: fresh.accuracyMetres, mocked: true }] })
          .catch(() => undefined);
      }
      return setStep('idle');
    }
    if (!canPunch(z)) {
      setMessage({ tone: 'danger', text: zoneMessage(t, z) });
      return setStep('idle');
    }
    advance({ kind, fix: fresh, offsite: z.kind === 'outsideOffsite' });
  };

  const dismiss = async (clientRef: string) => {
    await (await getQueueStore()).remove([clientRef]);
    await useCheckinQueue.getState().refresh();
  };

  if (!hasEmployee) {
    return (
      <Screen testID="checkin-screen">
        <Text className="text-center text-base text-ink-muted" testID="checkin-no-employee">
          {t('checkin.state.noEmployee')}
        </Text>
      </Screen>
    );
  }
  if (!status && query.isError && net.isConnected !== false) {
    return (
      <Screen testID="checkin-screen">
        <StateScreen kind="error" onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen testID="checkin-screen">
      <Text className="mb-4 text-2xl font-semibold text-ink dark:text-night-ink">{t('checkin.title')}</Text>
      {overdue ? (
        <Notice tone="danger" testID="checkin-offline-overdue" text={interpolate(t('notif.offlineUnsynced.body'), { count: pending.length })} />
      ) : null}
      {status?.offsitePermission ? (
        <Notice
          tone="warning"
          testID="checkin-offsite-permission"
          text={interpolate(t('checkin.offsite.permission'), { from: status.offsitePermission.fromDate, to: status.offsitePermission.toDate })}
        />
      ) : null}
      <ZoneCard status={status} zone={zone} accuracyMetres={fix.kind === 'ok' ? fix.fix.accuracyMetres : null} onRetry={() => void locate()} />
      <View className="mb-4">
        <PunchButton kind={kind} loading={step === 'busy'} disabled={!canPunch(zone) && zone.kind !== 'locating'} onPress={() => void onPunch()} />
      </View>
      {message ? <Notice tone={message.tone} text={message.text} testID="checkin-message" /> : null}
      {pending.length ? (
        <Notice
          tone="warning"
          testID="checkin-pending"
          text={net.isConnected === false ? `${t('state.offline.title')} · ${interpolate(t('checkin.pendingCount'), { count: pending.length })}` : interpolate(t('checkin.pendingCount'), { count: pending.length })}
          action={net.isConnected === false || syncing ? undefined : { label: t('checkin.syncNow'), onPress: () => void syncNow().then(() => qc.invalidateQueries({ queryKey: ['checkin'] })), testID: 'checkin-sync-now' }}
        />
      ) : null}
      <RecordList queued={queue} punches={punches.data ?? []} timeZone={timeZone} onDismiss={(ref) => void dismiss(ref)} />

      <OffsiteReasonSheet
        visible={step === 'reason'}
        onSubmit={(reason) => draft && advance({ ...draft, reason })}
        onCancel={() => {
          setDraft(null);
          setStep('idle');
        }}
      />
      <SelfieCapture
        visible={step === 'selfie'}
        onCaptured={(uri) => draft && advance({ ...draft, selfieUri: uri })}
        onCancel={() => {
          setDraft(null);
          setStep('idle');
        }}
      />
    </Screen>
  );
}
