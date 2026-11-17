import { describe, expect, it } from 'vitest';
import { isOfflineOverdue, nextPunchKind, passwordLoginSchema, punchBatchSchema, resolveNotificationLink } from '../src';

describe('check-in helpers (M5-C)', () => {
  it('offers OUT only after an IN', () => {
    expect(nextPunchKind(null)).toBe('IN');
    expect(nextPunchKind('IN')).toBe('OUT');
    expect(nextPunchKind('OUT')).toBe('IN');
  });

  it('flags unsent punches at the alert age (FR-ATT-08)', () => {
    const captured = new Date('2026-11-14T00:00:00Z');
    expect(isOfflineOverdue(null, new Date(), 72)).toBe(false);
    expect(isOfflineOverdue(captured, new Date('2026-11-16T23:59:00Z'), 72)).toBe(false);
    expect(isOfflineOverdue(captured, new Date('2026-11-17T00:00:00Z'), 72)).toBe(true);
  });

  it('validates a punch batch and defaults the flags', () => {
    const ok = punchBatchSchema.parse({
      deviceId: 'android-1234', platform: 'ANDROID', deviceSentAt: '2026-11-17T01:00:00.000Z',
      items: [{ clientRef: 'abcdef12', kind: 'IN', capturedAt: '2026-11-17T01:00:00+07:00', latitude: 17.9, longitude: 102.6, accuracyMetres: 10 }],
    });
    expect(ok.items[0]).toMatchObject({ mocked: false, offline: false });
    expect(punchBatchSchema.safeParse({ ...ok, platform: 'WEB' }).success).toBe(false);
    expect(punchBatchSchema.safeParse({ ...ok, items: [] }).success).toBe(false);
    expect(punchBatchSchema.safeParse({ ...ok, items: [{ ...ok.items[0], latitude: 91 }] }).success).toBe(false);
  });

  it('keeps the web login body valid without device fields', () => {
    expect(passwordLoginSchema.safeParse({ workspaceCode: 'som-demo', identifier: 'a@b.la', password: 'x' }).success).toBe(true);
    expect(passwordLoginSchema.safeParse({ workspaceCode: 'som-demo', identifier: 'a@b.la', password: 'x', platform: 'WEB' }).success).toBe(false);
  });

  it('opens the check-in screen from the offline alert on mobile only', () => {
    expect(resolveNotificationLink('/checkin', 'mobile')).toBe('/checkin');
    expect(resolveNotificationLink('/checkin', 'web')).toBeNull();
  });
});
