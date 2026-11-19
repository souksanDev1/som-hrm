import { describe, expect, it } from 'vitest';
import {
  assignmentIssues,
  buildOrgTree,
  changePinSchema,
  createEmployeeSchema,
  dictionaries,
  effectiveAssignment,
  findLaoProvinceCode,
  isoDateSchema,
  LAO_PROVINCES,
  laoPhoneSchema,
  laoProvinceName,
  missingContractEnd,
  translate,
  updateEmployeeSchema,
} from '../src';

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
    contractType: 'INDEFINITE',
    payType: 'MONTHLY',
    departmentId: 'd1',
    managerId: 'm1',
  };
  it('accepts a minimal Lao employee', () => {
    expect(createEmployeeSchema.safeParse(base).success).toBe(true);
  });
  it('requires a country for foreign workers', () => {
    const r = createEmployeeSchema.safeParse({ ...base, nationalityType: 'FOREIGN' });
    expect(r.success).toBe(false);
  });
  it('allows a password login without email (sign-in by employee code or phone)', () => {
    expect(createEmployeeSchema.safeParse({ ...base, login: { method: 'PASSWORD' } }).success).toBe(true);
    expect(createEmployeeSchema.safeParse({ ...base, login: { method: 'PIN' } }).success).toBe(true);
  });
  it('requires contract and pay type from their own enums (FR-EMP-03.5/03.6)', () => {
    const { contractType: _c, ...noContract } = base;
    expect(createEmployeeSchema.safeParse(noContract).success).toBe(false);
    expect(createEmployeeSchema.safeParse({ ...base, payType: 'FULL_TIME' }).success).toBe(false);
    expect(createEmployeeSchema.safeParse({ ...base, contractType: 'FIXED_TERM', contractEndDate: '2027-01-01', payType: 'HOURLY' }).success).toBe(true);
  });
  it('accepts English names, a structured address and a known province code only', () => {
    const full = { ...base, firstNameEn: 'Somchai', lastNameEn: 'Vong', village: 'ໂພນທັນ', district: 'ໄຊເສດຖາ', province: 'VT' };
    expect(createEmployeeSchema.parse(full)).toMatchObject({ firstNameEn: 'Somchai', province: 'VT' });
    const bad = createEmployeeSchema.safeParse({ ...base, province: 'Vientiane' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.message).toBe('invalid_province');
  });
  it('rejects contract / probation end dates before the hire date', () => {
    const r = createEmployeeSchema.safeParse({ ...base, contractType: 'FIXED_TERM', contractEndDate: '2024-12-31', probationEndDate: '2025-03-31' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => [i.path.join('.'), i.message])).toEqual([['contractEndDate', 'before_hire_date']]);
  });
});

describe('isoDateSchema', () => {
  it.each(['2024-02-29', '2030-12-31', '2026-01-01'])('accepts %s', (v) => {
    expect(isoDateSchema.safeParse(v).success).toBe(true);
  });
  it.each(['2030-13-02', '2025-02-29', '2026-04-31', '2026-00-10', '2026-1-1', '20260101', ''])('rejects %s with invalid_date', (v) => {
    const r = isoDateSchema.safeParse(v);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('invalid_date');
  });
});

describe('Lao provinces', () => {
  it('has 18 entries (17 provinces + Vientiane Capital) with unique codes', () => {
    expect(LAO_PROVINCES).toHaveLength(18);
    expect(new Set(LAO_PROVINCES.map((p) => p.code)).size).toBe(18);
  });
  it('resolves codes and Lao/English names; shows unknown values as-is', () => {
    expect(findLaoProvinceCode('Luang Prabang')).toBe('LP');
    expect(findLaoProvinceCode(' ຈຳປາສັກ ')).toBe('CH');
    expect(findLaoProvinceCode('vt')).toBe('VT');
    expect(findLaoProvinceCode('Atlantis')).toBeNull();
    expect(laoProvinceName('SV', 'en')).toBe('Savannakhet');
    expect(laoProvinceName('XX', 'lo')).toBe('XX');
  });
});

describe('missingContractEnd (fixed-term contracts need an end date)', () => {
  const fixed = { contractType: 'FIXED_TERM', contractEndDate: null };
  it('flags a new fixed-term contract without an end date', () => {
    expect(missingContractEnd(fixed)).toBe(true);
    expect(missingContractEnd({ ...fixed, contractEndDate: '2027-01-01' })).toBe(false);
    expect(missingContractEnd({ contractType: 'INDEFINITE', contractEndDate: null })).toBe(false);
  });
  it('flags switching to fixed-term or clearing the date, but not a legacy row left as it is', () => {
    expect(missingContractEnd(fixed, { contractType: 'INDEFINITE', contractEndDate: null })).toBe(true);
    expect(missingContractEnd(fixed, { contractType: 'FIXED_TERM', contractEndDate: '2027-01-01' })).toBe(true);
    expect(missingContractEnd(fixed, fixed)).toBe(false);
  });
  it('is enforced by createEmployeeSchema on the end date field', () => {
    const r = createEmployeeSchema.safeParse({
      employeeCode: 'E9', firstName: 'A', lastName: 'B', gender: 'MALE', hireDate: '2024-01-01', contractType: 'FIXED_TERM', payType: 'MONTHLY',
      departmentId: 'd1', managerId: 'm1',
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues).toContainEqual(expect.objectContaining({ path: ['contractEndDate'], message: 'contract_end_required' }));
  });
});

describe('updateEmployeeSchema', () => {
  it('distinguishes omitted (unchanged) from null/"" (clear)', () => {
    const r = updateEmployeeSchema.parse({ managerId: null, email: '', nickname: '  ', socialSecurityNo: null });
    expect(r).toMatchObject({ managerId: null, email: null, nickname: null, socialSecurityNo: null });
    expect('phone' in r && r.phone !== undefined).toBe(false);
  });
  it('does not apply create defaults', () => {
    const r = updateEmployeeSchema.parse({ firstName: 'A' });
    expect(r.status).toBeUndefined();
    expect(r.hazardousWork).toBeUndefined();
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
      employeeCode: 'E1', firstName: 'A', lastName: 'B', gender: 'MALE', hireDate: '2025-01-01', contractType: 'INDEFINITE', payType: 'DAILY',
      phone: '', email: '', dateOfBirth: '', departmentId: 'd1', managerId: '', isTopLevel: true, socialSecurityNo: '',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBeUndefined();
  });
});

describe('assignmentIssues (department + line manager)', () => {
  it('requires a department and a manager unless top level', () => {
    expect(assignmentIssues({})).toEqual(['department_required', 'manager_required']);
    expect(assignmentIssues({ departmentId: 'd' })).toEqual(['manager_required']);
    expect(assignmentIssues({ departmentId: 'd', isTopLevel: true })).toEqual([]);
    expect(assignmentIssues({ departmentId: 'd', managerId: 'm' })).toEqual([]);
  });
  it('rejects a manager on a top-level employee', () => {
    expect(assignmentIssues({ departmentId: 'd', managerId: 'm', isTopLevel: true })).toEqual(['manager_conflicts_top_level']);
  });
  it('leaves legacy rows alone unless the assignment is touched', () => {
    expect(assignmentIssues({ status: 'RESIGNED' } as never, { departmentId: null, managerId: null })).toEqual([]);
    expect(assignmentIssues({ managerId: 'm' }, { departmentId: null, managerId: null })).toEqual(['department_required']);
    expect(assignmentIssues({ managerId: null }, { departmentId: 'd', managerId: 'm', isTopLevel: false })).toEqual(['manager_required']);
  });
  it('merges changes over the stored assignment', () => {
    expect(effectiveAssignment({ managerId: 'm' }, { departmentId: 'd', managerId: null, isTopLevel: true })).toEqual({
      departmentId: 'd', managerId: 'm', isTopLevel: false,
    });
    expect(effectiveAssignment({ isTopLevel: true }, { departmentId: 'd', managerId: 'm', isTopLevel: false })).toEqual({
      departmentId: 'd', managerId: null, isTopLevel: true,
    });
  });
  it('is enforced by createEmployeeSchema on the department and manager fields', () => {
    const base = { employeeCode: 'E1', firstName: 'A', lastName: 'B', gender: 'MALE', hireDate: '2025-01-01', contractType: 'INDEFINITE', payType: 'MONTHLY' };
    const r = createEmployeeSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(r.error?.issues).toContainEqual(expect.objectContaining({ path: ['departmentId'], message: 'department_required' }));
    expect(r.error?.issues).toContainEqual(expect.objectContaining({ path: ['managerId'], message: 'manager_required' }));
    expect(createEmployeeSchema.safeParse({ ...base, isTopLevel: true, departmentId: 'd' }).success).toBe(true);
    const c = createEmployeeSchema.safeParse({ ...base, departmentId: 'd', managerId: 'm', isTopLevel: true });
    expect(c.error?.issues).toContainEqual(expect.objectContaining({ path: ['managerId'], message: 'manager_conflicts_top_level' }));
  });
  it('updateEmployeeSchema only rejects the manager/top-level conflict', () => {
    expect(updateEmployeeSchema.safeParse({ status: 'RESIGNED' }).success).toBe(true);
    const r = updateEmployeeSchema.safeParse({ isTopLevel: true, managerId: 'm' });
    expect(r.error?.issues).toContainEqual(expect.objectContaining({ path: ['managerId'], message: 'manager_conflicts_top_level' }));
  });
});
