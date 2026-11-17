import { describe, expect, it } from 'vitest';
import {
  canEditWorkspaceParameter,
  createWorkspaceSchema,
  dictionaries,
  isoDateInTimeZone,
  isValidTimeZone,
  PARAMETER_KEYS,
  PARAMETERS,
  parameterKeysByScope,
  setSystemParameterSchema,
  setWorkspaceParameterSchema,
  validateParameterValue,
} from '../src';

describe('validateParameterValue', () => {
  it('accepts valid values of every type', () => {
    expect(validateParameterValue('auth.lockout.maxAttempts', 5)).toBeNull();
    expect(validateParameterValue('notification.smsEnabled', true)).toBeNull();
    expect(validateParameterValue('document.expiryAlertDays', [90, 30])).toBeNull();
  });

  it('rejects unknown keys', () => {
    expect(validateParameterValue('nope.nope', 1)).toBe('unknown_parameter');
  });

  it('rejects wrong types', () => {
    expect(validateParameterValue('auth.lockout.maxAttempts', '5')).toBe('invalid_type');
    expect(validateParameterValue('auth.lockout.maxAttempts', 5.5)).toBe('invalid_type');
    expect(validateParameterValue('notification.smsEnabled', 1)).toBe('invalid_type');
    expect(validateParameterValue('document.expiryAlertDays', [30, 'x'])).toBe('invalid_type');
    expect(validateParameterValue('document.expiryAlertDays', 30)).toBe('invalid_type');
  });

  it('enforces min/max boundaries inclusively', () => {
    const def = PARAMETERS['approval.escalationWorkingDays'];
    expect(validateParameterValue('approval.escalationWorkingDays', def.min)).toBeNull();
    expect(validateParameterValue('approval.escalationWorkingDays', def.max)).toBeNull();
    expect(validateParameterValue('approval.escalationWorkingDays', def.min - 1)).toBe('out_of_range');
    expect(validateParameterValue('approval.escalationWorkingDays', def.max + 1)).toBe('out_of_range');
  });

  it('validates list length and members', () => {
    expect(validateParameterValue('document.expiryAlertDays', [])).toBe('too_many_items');
    expect(validateParameterValue('document.expiryAlertDays', [1, 2, 3, 4, 5, 6, 7])).toBe('too_many_items');
    expect(validateParameterValue('document.expiryAlertDays', [0])).toBe('out_of_range');
  });

  it('every registry default is itself valid', () => {
    for (const key of PARAMETER_KEYS) expect(validateParameterValue(key, PARAMETERS[key].defaultValue), key).toBeNull();
  });
});

describe('parameter registry', () => {
  it('splits keys by scope', () => {
    expect(parameterKeysByScope('system')).toContain('otp.length');
    expect(parameterKeysByScope('workspace')).toContain('document.expiryAlertDays');
    expect(parameterKeysByScope('workspace')).not.toContain('otp.length');
  });

  it('lets settings.manage edit any workspace key and editPermission holders only their key', () => {
    expect(canEditWorkspaceParameter('approval.levels', ['settings.manage'])).toBe(true);
    expect(canEditWorkspaceParameter('document.expiryAlertDays', ['employee.write'])).toBe(true);
    expect(canEditWorkspaceParameter('approval.levels', ['employee.write'])).toBe(false);
    expect(canEditWorkspaceParameter('document.expiryAlertDays', ['org.write'])).toBe(false);
    expect(canEditWorkspaceParameter('nope', ['employee.write'])).toBe(false);
  });

  it('has a Lao and English label for every parameter', () => {
    for (const key of PARAMETER_KEYS) {
      const labelKey = PARAMETERS[key].labelKey as keyof typeof dictionaries.lo;
      expect(dictionaries.lo[labelKey], key).toBeTruthy();
      expect(dictionaries.en[labelKey], key).toBeTruthy();
    }
  });
});

describe('time zone helpers', () => {
  it('computes the calendar date in a time zone', () => {
    // 2026-01-01 20:00 UTC is already 2 January in Vientiane (UTC+7).
    expect(isoDateInTimeZone('Asia/Vientiane', new Date('2026-01-01T20:00:00Z'))).toBe('2026-01-02');
    expect(isoDateInTimeZone('UTC', new Date('2026-01-01T20:00:00Z'))).toBe('2026-01-01');
  });
  it('validates IANA zones', () => {
    expect(isValidTimeZone('Asia/Vientiane')).toBe(true);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
  });
});

describe('parameter & platform schemas', () => {
  it('requires a reason and an ISO date for workspace changes', () => {
    expect(setWorkspaceParameterSchema.safeParse({ key: 'k', value: 1, effectiveFrom: '2026-12-01', reason: 'x' }).success).toBe(true);
    expect(setWorkspaceParameterSchema.safeParse({ key: 'k', value: 1, effectiveFrom: '01/12/2026', reason: 'x' }).success).toBe(false);
    expect(setWorkspaceParameterSchema.safeParse({ key: 'k', value: 1, effectiveFrom: '2026-12-01', reason: ' ' }).success).toBe(false);
  });
  it('requires an ISO date-time for system changes', () => {
    expect(setSystemParameterSchema.safeParse({ key: 'k', value: 1, effectiveFrom: '2026-12-01T00:00:00Z', reason: 'x' }).success).toBe(true);
    expect(setSystemParameterSchema.safeParse({ key: 'k', value: 1, effectiveFrom: '2026-12-01', reason: 'x' }).success).toBe(false);
  });
  it('needs an owner email or phone when creating a workspace', () => {
    const base = { code: 'acme', name: 'Acme', owner: { displayName: 'A', password: 'Secret123' } };
    const missing = createWorkspaceSchema.safeParse(base);
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.message).toBe('owner_contact_required');
    const phone = createWorkspaceSchema.parse({ ...base, seatLimit: '', owner: { ...base.owner, phone: '020 5555 1234', email: '' } });
    expect(phone.owner.phone).toBe('02055551234');
    expect(phone.owner.email).toBeUndefined();
    expect(phone.seatLimit).toBeUndefined();
    expect(createWorkspaceSchema.safeParse({ ...base, timezone: 'Mars/Base', owner: { ...base.owner, email: 'a@b.la' } }).success).toBe(false);
  });
});
