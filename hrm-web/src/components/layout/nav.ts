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
  // Approval inbox (FR-ORG-02): every user may be an approver or a delegate.
  { href: '/approvals', labelKey: 'nav.approvals', icon: 'approval', mobile: true },
  { href: '/notifications', labelKey: 'nav.notifications', icon: 'notifications', mobile: true, badge: 'unreadNotifications' },
  // Same permission as the page (RequirePermission ORG_WRITE); also a mobile tab so it is reachable below 1024px.
  { href: '/settings', labelKey: 'nav.settings', icon: 'settings', permission: PERMISSIONS.ORG_WRITE, mobile: true },
  // Readable by HR (org.write) and company admins; editing needs settings.manage (checked on the page + API).
  { href: '/settings/parameters', labelKey: 'param.title', icon: 'tune', permission: PERMISSIONS.ORG_WRITE },
  // Holiday calendar (FR-WS-04/05); also linked from /settings for the mobile layout.
  { href: '/settings/holidays', labelKey: 'holiday.title', icon: 'event', permission: PERMISSIONS.ORG_WRITE },
  // Standard working schedule + individual schedules (FR-WS-03); OWNER and HR_ADMIN by default.
  { href: '/settings/work-schedule', labelKey: 'schedule.title', icon: 'calendar_month', permission: PERMISSIONS.SCHEDULE_MANAGE },
  // Own account: change password/PIN and language (every signed-in user).
  { href: '/account', labelKey: 'authx.account.title', icon: 'manage_accounts' },
  // M5 agent D — HR attendance tools (FR-ATT-14/04/16.1/11) and own time corrections (FR-ATT-19).
  { href: '/attendance/review', labelKey: 'attreq.review.title', icon: 'policy', permission: PERMISSIONS.ATTENDANCE_REVIEW },
  { href: '/attendance/on-behalf', labelKey: 'attreq.onBehalf.title', icon: 'more_time', permission: PERMISSIONS.ATTENDANCE_PUNCH_ON_BEHALF },
  { href: '/attendance/offsite', labelKey: 'attreq.offsite.title', icon: 'share_location', permission: PERMISSIONS.ATTENDANCE_OFFSITE_MANAGE },
  { href: '/attendance/devices', labelKey: 'attreq.devices.title', icon: 'phonelink_lock', permission: PERMISSIONS.ATTENDANCE_DEVICE_MANAGE },
  { href: '/attendance/corrections', labelKey: 'attreq.correction.title', icon: 'edit_calendar' },
];

/** The most specific nav href matching `pathname` (so /settings/parameters does not also highlight /settings). */
export const activeNavHref = (pathname: string, items: readonly NavItem[]): string | undefined =>
  items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

export const visibleNav = (permissions: readonly string[]) =>
  NAV_ITEMS.filter((i) => !i.permission || permissions.includes(i.permission));
