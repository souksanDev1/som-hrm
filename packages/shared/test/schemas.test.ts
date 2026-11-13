import { describe, expect, it } from 'vitest';
import { buildOrgTree, changePinSchema, createEmployeeSchema, laoPhoneSchema, translate, dictionaries } from '../src';

describe('laoPhoneSchema', () => {
  it.each(['020 5555 1234', '+856 20 5555 1234', '8562055551234', '2055551234'])('normalises %s', (raw) => {
    expect(laoPhoneSchema.parse(raw)).toBe('02055551234');
  });
  it('rejects invalid numbers', () => {
    expect(laoPhoneSchema.safeParse('0912345678').success).toBe(false);
  });
});

describe('createEmployeeSchema', () => {
  const base = {
    employeeCode: 'E001',
    firstName: 'Somchai',
    lastName: 'Vong',
    gender: 'MALE',
    hireDate: '2025-01-01',
    employmentType: 'FULL_TIME',
  };
  it('accepts a minimal Lao employee', () => {
    expect(createEmployeeSchema.safeParse(base).success).toBe(true);
  });
  it('requires a country for foreign workers', () => {
    const r = createEmployeeSchema.safeParse({ ...base, nationalityType: 'FOREIGN' });
    expect(r.success).toBe(false);
  });
  it('requires email when creating a password login', () => {
    const r = createEmployeeSchema.safeParse({ ...base, login: { method: 'PASSWORD' } });
    expect(r.success).toBe(false);
    expect(createEmployeeSchema.safeParse({ ...base, login: { method: 'PIN' } }).success).toBe(true);
  });
});

describe('changePinSchema', () => {
  it('rejects weak or unchanged PINs', () => {
    expect(changePinSchema.safeParse({ currentPin: '482913', newPin: '111111' }).success).toBe(false);
    expect(changePinSchema.safeParse({ currentPin: '482913', newPin: '482913' }).success).toBe(false);
    expect(changePinSchema.safeParse({ currentPin: '482913', newPin: '730261' }).success).toBe(true);
  });
});

describe('buildOrgTree', () => {
  const node = (id: string) => ({ id, employeeCode: id, name: id, position: null, department: null });
  it('nests reports under managers and survives cycles', () => {
    const tree = buildOrgTree([
      { id: 'a', managerId: null, node: node('a') },
      { id: 'b', managerId: 'a', node: node('b') },
      { id: 'c', managerId: 'd', node: node('c') },
      { id: 'd', managerId: 'c', node: node('d') },
    ]);
    expect(tree.map((n) => n.id).sort()).toEqual(['a', 'c', 'd']);
    expect(tree.find((n) => n.id === 'a')?.children.map((n) => n.id)).toEqual(['b']);
  });
});

describe('i18n', () => {
  it('lo and en have identical keys', () => {
    expect(Object.keys(dictionaries.en).sort()).toEqual(Object.keys(dictionaries.lo).sort());
  });
  it('falls back to error.<code> for server codes', () => {
    expect(translate('en', 'invalid_credentials')).toBe('Invalid sign-in details');
    expect(translate('en', 'totally_unknown')).toBe('totally_unknown');
  });
});

describe('empty optional form inputs', () => {
  it('treats "" as not provided for optional dates, phone, email and refs', async () => {
    const { createDocumentSchema } = await import('../src');
    expect(createDocumentSchema.safeParse({ type: 'VISA', issuedAt: '', expiresAt: '2030-01-01' }).success).toBe(true);
    const r = createEmployeeSchema.safeParse({
      employeeCode: 'E1', firstName: 'A', lastName: 'B', gender: 'MALE', hireDate: '2025-01-01', employmentType: 'DAILY',
      phone: '', email: '', dateOfBirth: '', departmentId: '', socialSecurityNo: '',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBeUndefined();
  });
});
