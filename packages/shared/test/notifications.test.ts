import { describe, expect, it } from 'vitest';
import {
  alertThreshold,
  dictionaries,
  fitSmsText,
  isSmsNotificationType,
  MOBILE_LINK_ROUTES,
  NOTIFICATION_TYPES,
  PARAMETERS,
  resolveNotificationLink,
  SMS_MAX_LENGTH,
  smsTemplateKey,
  validateParameterValue,
} from '../src';

describe('resolveNotificationLink (FR-NOTI-04.2)', () => {
  it('keeps web links under known sections, as the web did before', () => {
    for (const link of ['/dashboard', '/employees', '/employees/abc', '/employees/abc?tab=docs', '/org', '/notifications', '/settings/parameters']) {
      expect(resolveNotificationLink(link, 'web'), link).toBe(link);
    }
  });

  it('maps links to the matching mobile screen', () => {
    expect(resolveNotificationLink('/profile', 'mobile')).toBe('/profile');
    expect(resolveNotificationLink('/holidays', 'mobile')).toBe('/holidays');
    expect(resolveNotificationLink('/settings/holidays', 'mobile')).toBe('/holidays');
    expect(resolveNotificationLink('/dashboard', 'mobile')).toBe('/home');
    expect(resolveNotificationLink('/org/departments', 'mobile')).toBe('/org');
    expect(resolveNotificationLink('/notifications', 'mobile')).toBe('/notifications');
  });

  it('opens one approval request on both surfaces, and the inbox for the section', () => {
    expect(resolveNotificationLink('/approvals/req_1-a', 'web')).toBe('/approvals/req_1-a');
    expect(resolveNotificationLink('/approvals/req_1-a', 'mobile')).toBe('/approvals/req_1-a');
    expect(resolveNotificationLink('/approvals', 'mobile')).toBe('/approvals');
    expect(resolveNotificationLink('/approvals/a/b', 'mobile')).toBe('/approvals');
    expect(resolveNotificationLink('/approvals/a?x=1', 'mobile')).toBe('/approvals');
  });

  it('has no screen for links a surface does not have', () => {
    expect(resolveNotificationLink('/employees/abc', 'mobile')).toBeNull();
    expect(resolveNotificationLink('/settings/parameters', 'mobile')).toBeNull();
    expect(resolveNotificationLink('/profile', 'web')).toBeNull();
    expect(resolveNotificationLink('/holidays', 'web')).toBeNull();
  });

  it('falls back to null for unknown, empty or unsafe links on both surfaces', () => {
    const unsafe = [
      null, undefined, '', 'employees/abc', '//evil.example', 'https://evil.example', 'javascript:alert(1)', '/\\evil.example',
      '/employees/../../x', '/employees/./x', '/unknown', '/employeesX', '/employees?x=1', '/profile/extra', '/ employees',
    ];
    for (const link of unsafe) {
      expect(resolveNotificationLink(link, 'web'), String(link)).toBeNull();
      expect(resolveNotificationLink(link, 'mobile'), String(link)).toBeNull();
    }
  });

  it('only ever returns routes the mobile app has', () => {
    const links = ['/dashboard', '/org', '/org/x', '/notifications', '/profile', '/holidays', '/settings/holidays'];
    for (const link of links) expect(MOBILE_LINK_ROUTES).toContain(resolveNotificationLink(link, 'mobile'));
  });
});

describe('SMS rules (FR-NOTI-02.2/02.3)', () => {
  it('sends only key events by SMS', () => {
    expect(isSmsNotificationType('APPROVAL_DECISION')).toBe(true);
    expect(isSmsNotificationType('DOCUMENT_EXPIRY')).toBe(true);
    expect(isSmsNotificationType('PROBATION_ENDING')).toBe(true);
    expect(isSmsNotificationType('APPROVAL_PENDING')).toBe(false);
    expect(isSmsNotificationType('SYSTEM')).toBe(false);
  });

  it('has a Lao and English SMS template for every notification type', () => {
    for (const type of NOTIFICATION_TYPES) {
      const key = smsTemplateKey(type);
      expect(dictionaries.lo, key).toHaveProperty([key]);
      expect(dictionaries.en, key).toHaveProperty([key]);
    }
  });

  it('fits text into one SMS length, cutting on code points', () => {
    expect(fitSmsText('  short   text ')).toBe('short text');
    const lao = 'ເອກະສານ'.repeat(40);
    const fitted = fitSmsText(lao);
    expect(Array.from(fitted)).toHaveLength(SMS_MAX_LENGTH);
    expect(fitted.endsWith('…')).toBe(true);
    expect(fitSmsText('abcdef', 4)).toBe('abc…');
  });
});

describe('alertThreshold', () => {
  it('returns the smallest threshold the remaining days fall within', () => {
    expect(alertThreshold(7, [14, 7])).toBe(7);
    expect(alertThreshold(0, [14, 7])).toBe(7);
    expect(alertThreshold(8, [7, 14])).toBe(14);
    expect(alertThreshold(15, [14, 7])).toBeNull();
    expect(alertThreshold(-1, [14, 7])).toBeNull();
  });
});

describe('probation.alertDays parameter', () => {
  it('defaults to 14 and 7 days and validates like other day lists', () => {
    expect(PARAMETERS['probation.alertDays'].defaultValue).toEqual([14, 7]);
    expect(validateParameterValue('probation.alertDays', [30, 7])).toBeNull();
    expect(validateParameterValue('probation.alertDays', [0])).toBe('out_of_range');
    expect(validateParameterValue('probation.alertDays', [1, 2, 3, 4, 5])).toBe('too_many_items');
  });
});
