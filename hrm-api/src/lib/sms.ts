/**
 * Outbound SMS adapter (FR-AUTH-02 OTP, FR-NOTI-02 optional SMS notifications).
 *
 * The production gateway for Laos is not chosen yet (see docs/TECHNICAL_ANALYSIS.md §7),
 * so only the `console` provider exists: it logs messages in development and lets tests
 * read what was "sent". Add a real provider behind the same interface.
 */
export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsSender {
  readonly provider: string;
  send(message: SmsMessage): Promise<void>;
}

/** Development/test sender. Keeps an in-memory outbox; never use in production. */
export interface ConsoleSmsSender extends SmsSender {
  readonly outbox: readonly SmsMessage[];
  clear(): void;
}

export const createConsoleSmsSender = (log: (msg: string) => void = () => undefined): ConsoleSmsSender => {
  const outbox: SmsMessage[] = [];
  return {
    provider: 'console',
    outbox,
    async send(message) {
      outbox.push(message);
      log(`[sms:console] to=${message.to} body=${message.body}`);
    },
    clear() {
      outbox.length = 0;
    },
  };
};
