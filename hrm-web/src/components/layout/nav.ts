import { PERMISSIONS, type TranslationKey } from '@hrm/shared';

export interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: string;
  /** Hidden unless the user has this permission. */
  permission?: string;
  /** Show in the mobile bottom tab bar. */
  mobile?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: 'space_dashboard', mobile: true },
  { href: '/employees', labelKey: 'nav.employees', icon: 'group', permission: PERMISSIONS.EMPLOYEE_READ, mobile: true },
  { href: '/org', labelKey: 'nav.org', icon: 'account_tree', permission: PERMISSIONS.ORG_READ, mobile: true },
  { href: '/notifications', labelKey: 'nav.notifications', icon: 'notifications', mobile: true },
  { href: '/settings', labelKey: 'nav.settings', icon: 'settings', permission: PERMISSIONS.ORG_WRITE },
];

export const visibleNav = (permissions: readonly string[]) =>
  NAV_ITEMS.filter((i) => !i.permission || permissions.includes(i.permission));
