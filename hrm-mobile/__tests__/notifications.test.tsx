import { resolveMobileLink } from '@/features/notifications/api';

describe('resolveMobileLink', () => {
  it('opens only routes that exist in the app', () => {
    expect(resolveMobileLink('/profile')).toBe('/profile');
    expect(resolveMobileLink('/employees/abc')).toBeNull();
    expect(resolveMobileLink(null)).toBeNull();
  });
});
