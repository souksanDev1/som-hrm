import { describe, expect, it } from 'vitest';
import {
  approvalCapacityOf,
  approveRequestSchema,
  createDelegationSchema,
  dateRangesOverlap,
  dictionaries,
  PARAMETERS,
  rejectRequestSchema,
  resolveApprover,
  validateParameterValue,
  type ApprovalChainMember,
  type ApprovalDelegateInfo,
} from '../src';

const DATE = '2026-11-16';
const m = (id: string, extra: Partial<ApprovalChainMember> = {}): ApprovalChainMember => ({ employeeId: id, userId: `u-${id}`, active: true, ...extra });
const noLeave = () => false;
const noDelegation = () => null;
const onLeave = (...ids: string[]) => (employeeId: string) => ids.includes(employeeId);
const delegations =
  (map: Record<string, ApprovalDelegateInfo>) =>
  (userId: string): ApprovalDelegateInfo | null =>
    map[userId] ?? null;

describe('resolveApprover — chain of command (FR-ORG-02)', () => {
  it('routes to the direct manager as MANAGER', () => {
    expect(resolveApprover([m('a'), m('b')], DATE, noLeave, noDelegation)).toEqual({
      kind: 'manager', chainIndex: 0, approverUserId: 'u-a', actingAs: 'MANAGER', delegateUserId: null,
    });
  });

  it('routes a requester without a manager to HR', () => {
    expect(resolveApprover([], DATE, noLeave, noDelegation)).toEqual({ kind: 'hr' });
  });

  it('starts at the requested level and names it MANAGER', () => {
    expect(resolveApprover([m('a'), m('b'), m('c')], DATE, noLeave, noDelegation, { startIndex: 1 })).toMatchObject({
      chainIndex: 1, approverUserId: 'u-b', actingAs: 'MANAGER',
    });
  });

  it('completes a later level when nobody is above (top of the chain), but sends level 1 to HR', () => {
    const chain = [m('a')];
    expect(resolveApprover(chain, DATE, noLeave, noDelegation, { startIndex: 1, completeWhenChainEnds: true })).toEqual({ kind: 'none' });
    expect(resolveApprover(chain, DATE, noLeave, noDelegation, { startIndex: 1 })).toEqual({ kind: 'hr' });
    expect(resolveApprover([], DATE, noLeave, noDelegation, { completeWhenChainEnds: true })).toEqual({ kind: 'none' });
  });
});

describe('resolveApprover — delegates (FR-ORG-03)', () => {
  it('gives the step to the manager with their active delegate', () => {
    const r = resolveApprover([m('a'), m('b')], DATE, noLeave, delegations({ 'u-a': { userId: 'u-d', active: true } }));
    expect(r).toEqual({ kind: 'manager', chainIndex: 0, approverUserId: 'u-a', actingAs: 'MANAGER', delegateUserId: 'u-d' });
  });

  it('keeps the step with a manager on leave who appointed a delegate', () => {
    const r = resolveApprover([m('a'), m('b')], DATE, onLeave('a'), delegations({ 'u-a': { userId: 'u-d', active: true } }));
    expect(r).toMatchObject({ chainIndex: 0, approverUserId: 'u-a', delegateUserId: 'u-d' });
  });

  it('ignores an inactive delegate, a self-delegation and an excluded delegate (e.g. the requester)', () => {
    const chain = [m('a'), m('b')];
    for (const d of [{ userId: 'u-d', active: false }, { userId: 'u-a', active: true }]) {
      expect(resolveApprover(chain, DATE, noLeave, delegations({ 'u-a': d }))).toMatchObject({ approverUserId: 'u-a', delegateUserId: null });
    }
    const excluded = resolveApprover(chain, DATE, onLeave('a'), delegations({ 'u-a': { userId: 'u-req', active: true } }), { excludeUserIds: ['u-req'] });
    expect(excluded).toMatchObject({ chainIndex: 1, approverUserId: 'u-b', actingAs: 'UPPER_LEVEL', delegateUserId: null });
  });

  it('passes the date to the lookups', () => {
    const seen: string[] = [];
    resolveApprover([m('a')], DATE, (_, d) => (seen.push(`leave:${d}`), false), (_, d) => (seen.push(`deleg:${d}`), null));
    expect(seen).toEqual([`deleg:${DATE}`, `leave:${DATE}`]);
  });
});

describe('resolveApprover — absent or unavailable managers (FR-ORG-04)', () => {
  it('skips a manager on leave without a delegate to the next level as UPPER_LEVEL', () => {
    expect(resolveApprover([m('a'), m('b')], DATE, onLeave('a'), noDelegation)).toMatchObject({
      chainIndex: 1, approverUserId: 'u-b', actingAs: 'UPPER_LEVEL', delegateUserId: null,
    });
  });

  it('skips several absent levels and uses a delegate found higher up', () => {
    const r = resolveApprover([m('a'), m('b'), m('c')], DATE, onLeave('a', 'b', 'c'), delegations({ 'u-c': { userId: 'u-d', active: true } }));
    expect(r).toMatchObject({ chainIndex: 2, approverUserId: 'u-c', actingAs: 'UPPER_LEVEL', delegateUserId: 'u-d' });
  });

  it('sends the step to HR when everyone in the chain is on leave (top of the chain)', () => {
    expect(resolveApprover([m('a'), m('b')], DATE, onLeave('a', 'b'), noDelegation)).toEqual({ kind: 'hr' });
    expect(resolveApprover([m('a'), m('b')], DATE, onLeave('a', 'b'), noDelegation, { completeWhenChainEnds: true })).toEqual({ kind: 'hr' });
  });

  it('skips managers without a login, with a disabled login, or excluded', () => {
    const chain = [m('a', { userId: null }), m('b', { active: false }), m('c'), m('d')];
    expect(resolveApprover(chain, DATE, noLeave, noDelegation)).toMatchObject({ chainIndex: 2, approverUserId: 'u-c', actingAs: 'UPPER_LEVEL' });
    expect(resolveApprover(chain, DATE, noLeave, noDelegation, { excludeUserIds: ['u-c'] })).toMatchObject({ approverUserId: 'u-d' });
    expect(resolveApprover([m('a', { active: false })], DATE, noLeave, noDelegation)).toEqual({ kind: 'hr' });
  });

  it('never routes to the requester when they appear in their own chain', () => {
    expect(resolveApprover([m('a'), m('req')], DATE, onLeave('a'), noDelegation, { excludeUserIds: ['u-req'] })).toEqual({ kind: 'hr' });
  });
});

describe('resolveApprover — escalation and cycles (FR-ORG-05)', () => {
  it('names whoever is found UPPER_LEVEL when escalating', () => {
    expect(resolveApprover([m('a'), m('b')], DATE, noLeave, noDelegation, { startIndex: 1, escalated: true })).toMatchObject({
      chainIndex: 1, approverUserId: 'u-b', actingAs: 'UPPER_LEVEL',
    });
  });

  it('escalates past the top of the chain to HR', () => {
    expect(resolveApprover([m('a')], DATE, noLeave, noDelegation, { startIndex: 1, escalated: true })).toEqual({ kind: 'hr' });
  });

  it('stops at a cycle in the reporting lines instead of looping', () => {
    const cycle = [m('a'), m('b'), m('a'), m('b')];
    expect(resolveApprover(cycle, DATE, onLeave('a', 'b'), noDelegation)).toEqual({ kind: 'hr' });
    expect(resolveApprover(cycle, DATE, noLeave, noDelegation, { startIndex: 2, completeWhenChainEnds: true })).toEqual({ kind: 'none' });
  });

  it('treats a negative start as the direct manager', () => {
    expect(resolveApprover([m('a')], DATE, noLeave, noDelegation, { startIndex: -3 })).toMatchObject({ chainIndex: 0 });
  });
});

describe('approvalCapacityOf (FR-ORG-06)', () => {
  const step = { approverUserId: 'u-a', delegateUserId: 'u-d', actingAs: 'UPPER_LEVEL' as const };
  const user = (userId: string, extra: { hrFallback?: boolean; delegatorUserIds?: string[] } = {}) => ({
    userId, hrFallback: extra.hrFallback ?? false, delegatorUserIds: extra.delegatorUserIds ?? [],
  });

  it('gives the owner the routed capacity and delegates the DELEGATE capacity', () => {
    expect(approvalCapacityOf(step, user('u-a'))).toBe('UPPER_LEVEL');
    expect(approvalCapacityOf(step, user('u-d'))).toBe('DELEGATE');
    expect(approvalCapacityOf(step, user('u-x', { delegatorUserIds: ['u-a'] }))).toBe('DELEGATE');
    expect(approvalCapacityOf(step, user('u-x', { hrFallback: true }))).toBeNull();
  });

  it('lets only HR fallback users decide an HR step', () => {
    const hr = { approverUserId: null, delegateUserId: null, actingAs: 'HR' as const };
    expect(approvalCapacityOf(hr, user('u-h', { hrFallback: true }))).toBe('HR');
    expect(approvalCapacityOf(hr, user('u-a'))).toBeNull();
  });
});

describe('approval schemas, parameter and i18n', () => {
  it('requires a note to reject but not to approve', () => {
    expect(approveRequestSchema.safeParse({}).success).toBe(true);
    expect(rejectRequestSchema.safeParse({ note: '  ' }).success).toBe(false);
    expect(rejectRequestSchema.safeParse({ note: 'No cover' }).success).toBe(true);
  });

  it('rejects a delegation ending before it starts', () => {
    const r = createDelegationSchema.safeParse({ delegateUserId: 'u', startDate: '2026-11-20', endDate: '2026-11-19' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ message: 'end_before_start', path: ['endDate'] });
    expect(createDelegationSchema.safeParse({ delegateUserId: 'u', startDate: '2026-11-20', endDate: '2026-11-20' }).success).toBe(true);
  });

  it('detects overlapping inclusive ranges', () => {
    const r = { startDate: '2026-11-10', endDate: '2026-11-20' };
    expect(dateRangesOverlap(r, { startDate: '2026-11-20', endDate: '2026-11-25' })).toBe(true);
    expect(dateRangesOverlap(r, { startDate: '2026-11-21', endDate: '2026-11-25' })).toBe(false);
    expect(dateRangesOverlap(r, { startDate: '2026-11-01', endDate: '2026-11-09' })).toBe(false);
  });

  it('registers approval.levels (default 1 = direct manager only)', () => {
    expect(PARAMETERS['approval.levels']).toMatchObject({ scope: 'workspace', defaultValue: 1, min: 1 });
    expect(validateParameterValue('approval.levels', 0)).toBe('out_of_range');
    expect(dictionaries.en['param.approval.levels']).toBeTruthy();
    expect(dictionaries.lo['notif.approvalPending.title']).not.toBe(dictionaries.en['notif.approvalPending.title']);
  });
});
