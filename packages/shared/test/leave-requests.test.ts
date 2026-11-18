import { describe, expect, it } from 'vitest';
import { leavePreviewInputOf, leaveRequestListQuerySchema, resolveNotificationLink } from '../src';

describe('leavePreviewInputOf', () => {
  const base = { leaveTypeId: 't1', startDate: '2030-12-03', endDate: '2030-12-04', halfDay: 'NONE' as const, multipleBirth: false };

  it('previews only a complete, ordered range with a type', () => {
    expect(leavePreviewInputOf(base)).toEqual(base);
    expect(leavePreviewInputOf({ ...base, leaveTypeId: '' })).toBeNull();
    expect(leavePreviewInputOf({ ...base, endDate: '2030-12-0' })).toBeNull();
    expect(leavePreviewInputOf({ ...base, endDate: '2030-12-02' })).toBeNull();
  });

  it('passes the employee filed for only when set', () => {
    expect(leavePreviewInputOf({ ...base, employeeId: '' })).not.toHaveProperty('employeeId');
    expect(leavePreviewInputOf({ ...base, employeeId: 'e9' })).toMatchObject({ employeeId: 'e9' });
  });
});

describe('leaveRequestListQuerySchema', () => {
  it('defaults to own requests and coerces the year', () => {
    expect(leaveRequestListQuerySchema.parse({})).toEqual({ scope: 'mine' });
    expect(leaveRequestListQuerySchema.parse({ scope: 'team', year: '2030', status: 'PENDING' })).toEqual({ scope: 'team', year: 2030, status: 'PENDING' });
    expect(leaveRequestListQuerySchema.safeParse({ scope: 'all' }).success).toBe(false);
  });
});

describe('leave notification links', () => {
  it('opens one request on both surfaces and the leave list for anything else', () => {
    expect(resolveNotificationLink('/leave/ckabc123', 'web')).toBe('/leave/ckabc123');
    expect(resolveNotificationLink('/leave/ckabc123', 'mobile')).toBe('/leave/ckabc123');
    expect(resolveNotificationLink('/leave', 'mobile')).toBe('/leave');
    expect(resolveNotificationLink('/leave/a/b', 'mobile')).toBe('/leave');
    expect(resolveNotificationLink('/leavex', 'mobile')).toBeNull();
  });
});
