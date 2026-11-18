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
  // Daily attendance report (FR-ATT-18): HR sees the workspace, managers their reporting tree.
  { href: '/attendance', labelKey: 'nav.attendance', icon: 'schedule', permission: PERMISSIONS.ATTENDANCE_READ_ALL },
  // Rotating roster (FR-ATT-17.3) and shift definitions (FR-ATT-17.1/17.2).
  { href: '/attendance/roster', labelKey: 'roster.title', icon: 'calendar_view_week', permission: PERMISSIONS.SHIFT_MANAGE },
  { href: '/settings/shifts', labelKey: 'shifts.title', icon: 'view_timeline', permission: PERMISSIONS.SHIFT_MANAGE },
  // Own overtime requests and approved OT hours (FR-ATT-20/23): every signed-in employee.
  { href: '/overtime', labelKey: 'otx.mine.title', icon: 'more_time' },
  // Monthly OT by category (payroll input) for HR and managers within their data scope (FR-ATT-21).
  { href: '/overtime/report', labelKey: 'otx.report.title', icon: 'timer', permission: PERMISSIONS.ATTENDANCE_READ_ALL },
  // Scanner-file import (FR-ATT-02): HR uploads ZKTeco/HIP/CSV/Excel scan files.
  { href: '/attendance/scan-import', labelKey: 'scan.title', icon: 'fingerprint', permission: PERMISSIONS.SCAN_IMPORT },
  // M5 agent D — HR attendance tools (FR-ATT-14/04/16.1/11) and own time corrections (FR-ATT-19).
  { href: '/attendance/review', labelKey: 'attreq.review.title', icon: 'policy', permission: PERMISSIONS.ATTENDANCE_REVIEW },
  { href: '/attendance/on-behalf', labelKey: 'attreq.onBehalf.title', icon: 'more_time', permission: PERMISSIONS.ATTENDANCE_PUNCH_ON_BEHALF },
  { href: '/attendance/offsite', labelKey: 'attreq.offsite.title', icon: 'share_location', permission: PERMISSIONS.ATTENDANCE_OFFSITE_MANAGE },
  { href: '/attendance/devices', labelKey: 'attreq.devices.title', icon: 'phonelink_lock', permission: PERMISSIONS.ATTENDANCE_DEVICE_MANAGE },
  { href: '/attendance/corrections', labelKey: 'attreq.correction.title', icon: 'edit_calendar' },
  // M5 agent G — kiosk tablets of the branches (FR-ATT-03.1, FR-WS-06.3).
  { href: '/settings/kiosks', labelKey: 'kiosk.title', icon: 'tablet_android', permission: PERMISSIONS.KIOSK_MANAGE },
  // M6 agent B — leave type settings (FR-LV-01/02) and the per-employee leave ledger with HR adjustments (FR-LV-07).
  { href: '/settings/leave-types', labelKey: 'lvp.types.title', icon: 'beach_access', permission: PERMISSIONS.LEAVE_MANAGE },
  { href: '/leave/ledger', labelKey: 'lvp.ledger.title', icon: 'account_balance_wallet', permission: PERMISSIONS.LEAVE_MANAGE },
];

/** The most specific nav href matching `pathname` (so /settings/parameters does not also highlight /settings). */
export const activeNavHref = (pathname: string, items: readonly NavItem[]): string | undefined =>
  items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

export const visibleNav = (permissions: readonly string[]) =>
  NAV_ITEMS.filter((i) => !i.permission || permissions.includes(i.permission));
