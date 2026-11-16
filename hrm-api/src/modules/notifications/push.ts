/**
 * Push delivery adapter (FR-NOTI-01). Selected with env PUSH_PROVIDER:
 * - `none` (default): no provider configured; the delivery job marks push deliveries SKIPPED.
 * - `expo`: Expo push service over plain HTTP (no SDK); tokens are Expo push tokens from the mobile app.
 */
export interface PushMessage {
  tokens: readonly string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  /** Tokens the provider reported as no longer registered; callers should delete them. */
  invalidTokens: string[];
}

export interface PushSender {
  readonly provider: 'expo' | 'none' | (string & {});
  /** Throws when nothing could be delivered (the job retries with backoff). */
  send(message: PushMessage): Promise<PushResult>;
}

export const createNoopPushSender = (): PushSender => ({
  provider: 'none',
  async send() {
    return { invalidTokens: [] };
  },
});

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export const createExpoPushSender = (opts: { accessToken?: string; fetchImpl?: typeof fetch } = {}): PushSender => ({
  provider: 'expo',
  async send({ tokens, title, body, data }) {
    const doFetch = opts.fetchImpl ?? globalThis.fetch;
    const res = await doFetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
      },
      body: JSON.stringify(tokens.map((to) => ({ to, title, body, data, sound: 'default' }))),
    });
    if (!res.ok) throw new Error(`expo_http_${res.status}`);
    const payload = (await res.json()) as { data?: ExpoTicket[] };
    const tickets = payload.data ?? [];
    const invalidTokens = tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
    // Every token unregistered is not retryable: report them so the caller can clean up.
    if (!tickets.some((t) => t.status === 'ok') && invalidTokens.length < tokens.length) {
      throw new Error(tickets.find((t) => t.message)?.message ?? 'expo_no_ticket');
    }
    return { invalidTokens };
  },
});

export const createPushSender = (provider: 'expo' | 'none', accessToken?: string): PushSender =>
  provider === 'expo' ? createExpoPushSender({ accessToken }) : createNoopPushSender();
