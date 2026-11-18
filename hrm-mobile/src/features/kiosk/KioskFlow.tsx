import { interpolate, localDateTimeOf, PIN_LENGTH, type KioskInfo, type PunchKind } from '@hrm/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Segmented } from '@/components/ui';
import { SelfieCapture } from '@/features/checkin/CheckinViews';
import { timeOf } from '@/features/checkin/zone';
import { usePrefsStore, useT } from '@/lib/i18n';
import { Keypad } from './Keypad';

/** Longest employee code (same limit as the API schema). */
const CODE_MAX = 20;
/** The confirmation goes back to the idle screen by itself after this long (kiosk UX, not a business rule). */
export const KIOSK_RESET_MS = 5_000;

export type KioskOutcome =
  | { kind: 'done'; employeeName: string; punchKind: PunchKind; capturedAt: string }
  | { kind: 'queued'; capturedAt: string }
  | { kind: 'error'; code: string };

export interface KioskPunchRequest {
  employeeCode: string;
  pin: string;
  photoUri: string;
}

export interface KioskFlowProps {
  info: KioskInfo;
  /** Waiting punches on the tablet (offline queue). */
  pending: number;
  /** Queue the punch and try to send it; resolves with what to show. */
  submit(req: KioskPunchRequest): Promise<KioskOutcome>;
  resetAfterMs?: number;
}

type Step = { name: 'idle' } | { name: 'code' } | { name: 'pin' } | { name: 'photo' } | { name: 'sending' } | { name: 'result'; outcome: KioskOutcome };

function Clock({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);
  return (
    <View className="items-center">
      <Text className="text-7xl font-bold text-ink dark:text-night-ink" testID="kiosk-clock">
        {timeOf(now.toISOString(), timeZone)}
      </Text>
      <Text className="text-lg text-ink-muted">{localDateTimeOf(now, timeZone).date}</Text>
    </View>
  );
}

/**
 * The kiosk punch flow (FR-ATT-03.1–03.3): idle clock → employee code → PIN → photo (always) → confirmation with
 * the employee's name, IN/OUT and time → back to idle after a few seconds. The API decides everything.
 */
export function KioskFlow({ info, pending, submit, resetAfterMs = KIOSK_RESET_MS }: KioskFlowProps) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const setLocale = usePrefsStore((s) => s.setLocale);
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');

  const reset = () => {
    setCode('');
    setPin('');
    setStep({ name: 'idle' });
  };

  useEffect(() => {
    if (step.name !== 'result') return;
    const id = setTimeout(reset, resetAfterMs);
    return () => clearTimeout(id);
  }, [step, resetAfterMs]);

  const send = async (photoUri: string) => {
    setStep({ name: 'sending' });
    const outcome = await submit({ employeeCode: code.trim().toUpperCase(), pin, photoUri }).catch((): KioskOutcome => ({ kind: 'error', code: 'unknown' }));
    setPin('');
    setStep({ name: 'result', outcome });
  };

  const header = (
    <View className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1">
        <Text className="text-xl font-semibold text-ink dark:text-night-ink" testID="kiosk-branch">
          {info.branch.name}
        </Text>
        <Text className="text-sm text-ink-muted">{info.workspace.name}</Text>
      </View>
      <View className="w-40">
        <Segmented
          value={locale}
          onChange={setLocale}
          options={[
            { value: 'lo', label: 'ລາວ', testID: 'kiosk-lang-lo' },
            { value: 'en', label: 'EN', testID: 'kiosk-lang-en' },
          ]}
        />
      </View>
    </View>
  );

  let body;
  if (step.name === 'idle') {
    body = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('kiosk.idle.tap')}
        disabled={!info.kioskEnabled}
        onPress={() => setStep({ name: 'code' })}
        testID="kiosk-start"
        className="flex-1 items-center justify-center gap-6"
      >
        <Clock timeZone={info.timeZone} />
        {info.kioskEnabled ? (
          <View className="rounded-lg bg-primary px-10 py-6">
            <Text className="text-2xl font-semibold text-white">{t('kiosk.idle.tap')}</Text>
          </View>
        ) : (
          <Text className="px-6 text-center text-lg text-danger" testID="kiosk-disabled">
            {t('kiosk.idle.disabled')}
          </Text>
        )}
        {pending > 0 && (
          <Text className="text-base text-warning" testID="kiosk-pending">
            {interpolate(t('kiosk.idle.pending'), { count: pending })}
          </Text>
        )}
      </Pressable>
    );
  } else if (step.name === 'code' || step.name === 'pin') {
    const isCode = step.name === 'code';
    body = (
      <View className="w-full max-w-[480px] flex-1 self-center justify-center gap-4" testID={isCode ? 'kiosk-code-step' : 'kiosk-pin-step'}>
        <Text className="text-center text-2xl font-semibold text-ink dark:text-night-ink">{t(isCode ? 'kiosk.code.title' : 'kiosk.pin.title')}</Text>
        {isCode ? (
          <Keypad testID="kiosk-code" value={code} onChange={setCode} maxLength={CODE_MAX} allowLetters onSubmit={() => setStep({ name: 'pin' })} />
        ) : (
          <Keypad testID="kiosk-pin" value={pin} onChange={setPin} maxLength={PIN_LENGTH} masked autoSubmit onSubmit={(v) => v.length === PIN_LENGTH && setStep({ name: 'photo' })} />
        )}
        <Button title={t('common.cancel')} variant="ghost" onPress={reset} testID="kiosk-cancel" />
      </View>
    );
  } else if (step.name === 'sending' || step.name === 'photo') {
    body = (
      <View className="flex-1 items-center justify-center gap-4" testID="kiosk-sending">
        <ActivityIndicator size="large" color="#1F5FD6" />
        <Text className="text-lg text-ink-muted">{t('kiosk.sending')}</Text>
      </View>
    );
  } else {
    const { outcome } = step;
    const ok = outcome.kind !== 'error';
    body = (
      <Pressable accessibilityRole="button" onPress={reset} className="flex-1 items-center justify-center gap-4 px-6" testID="kiosk-result">
        <View className={`h-28 w-28 items-center justify-center rounded-full ${ok ? 'bg-success-soft' : 'bg-danger-soft'}`}>
          <Text className={`text-6xl ${ok ? 'text-success' : 'text-danger'}`}>{ok ? '✓' : '!'}</Text>
        </View>
        {outcome.kind === 'done' && (
          <>
            <Text className="text-center text-3xl font-bold text-ink dark:text-night-ink" testID="kiosk-result-name">
              {outcome.employeeName}
            </Text>
            <Text className="text-center text-2xl font-semibold text-success" testID="kiosk-result-kind">
              {t(`kiosk.done.${outcome.punchKind}`)}
            </Text>
            <Text className="text-xl text-ink-muted">{interpolate(t('kiosk.done.at'), { time: timeOf(outcome.capturedAt, info.timeZone) })}</Text>
          </>
        )}
        {outcome.kind === 'queued' && (
          <Text className="text-center text-2xl font-semibold text-ink dark:text-night-ink" testID="kiosk-result-queued">
            {t('kiosk.done.queued')}
          </Text>
        )}
        {outcome.kind === 'error' && (
          <>
            <Text className="text-center text-2xl font-semibold text-danger">{t('kiosk.failed')}</Text>
            <Text className="text-center text-xl text-ink dark:text-night-ink" testID="kiosk-result-error">
              {t(outcome.code)}
            </Text>
          </>
        )}
        <Text className="text-base text-primary">{t('kiosk.backToIdle')}</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas px-6 py-4 dark:bg-night-canvas" testID="kiosk-screen">
      {header}
      {body}
      {/* Photo at every kiosk punch (FR-ATT-03.3): the same front-camera capture as the phone check-in. */}
      <SelfieCapture visible={step.name === 'photo'} onCaptured={(uri) => void send(uri)} onCancel={reset} />
    </SafeAreaView>
  );
}
