/**
 * Push delivery adapter (FR-NOTI-01.1). Selected with env PUSH_PROVIDER:
 * - `none` (default): no provider configured; the delivery job marks push deliveries SKIPPED.
 * - `expo`: Expo push service over its HTTP API (no SDK); tokens are Expo push tokens from the mobile app.
 *   Expo forwards to FCM (Android) and APNs (iOS) with the credentials stored in the EAS project.
 */
export interface PushMessage {
  /** One device token. */
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Provider error codes are passed through (Expo: `DeviceNotRegistered`, `MessageTooBig`,
 * `MessageRateExceeded`, `MismatchSenderId`, `InvalidCredentials`); transport failures are
 * `http_<status>` or `network`.
 */
export type PushTicket = { status: 'ok'; id: string } | { status: 'error'; error: string; message?: string };
export type PushReceipt = { status: 'ok' } | { status: 'error'; error: string; message?: string };

/** The token is gone for good (app uninstalled, token rotated): stop sending to it. */
export const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';

export interface PushSender {
  readonly provider: 'expo' | 'none' | (string & {});
  /**
   * Send messages, batched as the provider requires. Returns one ticket per message, in order; a batch
   * that fails as a whole yields error tickets for its messages instead of throwing.
   */
  send(messages: readonly PushMessage[]): Promise<PushTicket[]>;
  /** Delivery receipts by ticket id; ids the provider has no receipt for yet are absent. Throws on transport errors. */
  getReceipts(ticketIds: readonly string[]): Promise<Record<string, PushReceipt>>;
}

export const createNoopPushSender = (): PushSender => ({
  provider: 'none',
  async send(messages) {
    return messages.map(() => ({ status: 'error', error: 'push_disabled' }));
  },
  async getReceipts() {
    return {};
  },
});

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo accepts at most 100 messages per send request and recommends at most 1000 ids per receipts request. */
export const EXPO_SEND_BATCH = 100;
export const EXPO_RECEIPTS_BATCH = 1000;

interface ExpoResult {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoResponse<T> {
  data?: T;
  /** Request-level errors (e.g. validation); the whole request failed. */
  errors?: { code?: string; message?: string }[];
}

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const toReceipt = (r: ExpoResult): PushReceipt =>
  r.status === 'ok' ? { status: 'ok' } : { status: 'error', error: r.details?.error ?? 'unknown', message: r.message };

export const createExpoPushSender = (opts: { accessToken?: string; fetchImpl?: typeof fetch } = {}): PushSender => {
  const post = async <T>(url: string, body: unknown): Promise<T> => {
    const doFetch = opts.fetchImpl ?? globalThis.fetch;
    let res: Response;
    try {
      res = await doFetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('network');
    }
    if (!res.ok) throw new Error(`http_${res.status}`);
    const payload = (await res.json()) as ExpoResponse<T>;
    if (payload.data === undefined) throw new Error(payload.errors?.[0]?.code ?? 'expo_no_data');
    return payload.data;
  };

  return {
    provider: 'expo',
    async send(messages) {
      const tickets: PushTicket[] = [];
      for (const batch of chunk(messages, EXPO_SEND_BATCH)) {
        try {
          const data = await post<ExpoResult[]>(
            EXPO_PUSH_URL,
            batch.map(({ to, title, body, data: extra }) => ({ to, title, body, data: extra, sound: 'default', priority: 'high' })),
          );
          batch.forEach((_, i) => {
            const r = data[i];
            if (r?.status === 'ok') tickets.push(r.id ? { status: 'ok', id: r.id } : { status: 'error', error: 'expo_no_ticket' });
            else tickets.push({ status: 'error', error: r?.details?.error ?? 'unknown', message: r?.message });
          });
        } catch (err) {
          const error = err instanceof Error ? err.message : 'network';
          batch.forEach(() => tickets.push({ status: 'error', error }));
        }
      }
      return tickets;
    },
    async getReceipts(ticketIds) {
      const receipts: Record<string, PushReceipt> = {};
      for (const ids of chunk(ticketIds, EXPO_RECEIPTS_BATCH)) {
        const data = await post<Record<string, ExpoResult>>(EXPO_RECEIPTS_URL, { ids });
        for (const [id, r] of Object.entries(data)) receipts[id] = toReceipt(r);
      }
      return receipts;
    },
  };
};

export const createPushSender = (provider: 'expo' | 'none', accessToken?: string): PushSender =>
  provider === 'expo' ? createExpoPushSender({ accessToken }) : createNoopPushSender();
