import { PERMISSIONS, type TranslationKey } from '@hrm/shared';

export interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: string;
  /** Hidden unless the user has this permission. */
  permission?: string;
  /** Show in the mobile bottom tab bar. */
  mobile?: boolean;
  /** Live counter shown next to the label. */
  badge?: 'unreadNotifications';
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: 'space_dashboard', mobile: true },
  { href: '/employees', labelKey: 'nav.employees', icon: 'group', permission: PERMISSIONS.EMPLOYEE_READ, mobile: true },
  // FR-EMP-06: expired / expiring documents within the user's data scope.
  { href: '/documents/expiring', labelKey: 'empx.expiring.title', icon: 'event_busy', permission: PERMISSIONS.EMPLOYEE_READ },
  { href: '/org', labelKey: 'nav.org', icon: 'account_tree', permission: PERMISSIONS.ORG_READ, mobile: true },
  { href: '/notifications', labelKey: 'nav.notifications', icon: 'notifications', mobile: true, badge: 'unreadNotifications' },
  // Same permission as the page (RequirePermission ORG_WRITE); also a mobile tab so it is reachable below 1024px.
  { href: '/settings', labelKey: 'nav.settings', icon: 'settings', permission: PERMISSIONS.ORG_WRITE, mobile: true },
  // Readable by HR (org.write) and company admins; editing needs settings.manage (checked on the page + API).
  { href: '/settings/parameters', labelKey: 'param.title', icon: 'tune', permission: PERMISSIONS.ORG_WRITE },
  // Own account: change password/PIN and language (every signed-in user).
  { href: '/account', labelKey: 'authx.account.title', icon: 'manage_accounts' },
];

/** The most specific nav href matching `pathname` (so /settings/parameters does not also highlight /settings). */
export const activeNavHref = (pathname: string, items: readonly NavItem[]): string | undefined =>
  items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

export const visibleNav = (permissions: readonly string[]) =>
  NAV_ITEMS.filter((i) => !i.permission || permissions.includes(i.permission));
