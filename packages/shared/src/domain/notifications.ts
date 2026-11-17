import type { NotificationType } from '../enums';

/**
 * Notification routing rules shared by the API, web and mobile (FR-NOTI-02, FR-NOTI-04.2).
 */

// ─────────────────────── Deep links (FR-NOTI-04.2) ───────────────────────

/** Where a notification is opened: the web app or the mobile app. */
export type LinkSurface = 'web' | 'mobile';

/** Each client's notification list: where a tap lands when a link has no screen on that surface. */
export const NOTIFICATIONS_ROUTE = '/notifications';

/** Screens of the mobile app (Expo Router paths) a notification may open. */
export const MOBILE_LINK_ROUTES = ['/home', '/org', '/notifications', '/profile', '/holidays', '/approvals'] as const;
/** A fixed screen, or one approval request's detail screen. */
export type MobileLinkRoute = (typeof MOBILE_LINK_ROUTES)[number] | `/approvals/${string}`;

interface LinkRule {
  /** Matched against the whole stored link. */
  pattern: RegExp;
  /** Route to open on each surface (`keep` = the link itself); null = no screen there. */
  web: string | typeof KEEP | null;
  mobile: MobileLinkRoute | typeof KEEP | null;
}

const KEEP = Symbol('keep');
/** `/section` itself or anything below it (`/section/...`), never `/sectionX` or `/section?x`. */
const section = (path: string) => new RegExp(`^${path}(?:/|$)`);

/**
 * The one mapping from `Notification.link` (written by the API as an app path, e.g. `/employees/abc`)
 * to the screen each client opens. First match wins; add a rule here when a feature links somewhere new.
 */
const LINK_RULES: readonly LinkRule[] = [
  { pattern: section('/dashboard'), web: KEEP, mobile: '/home' },
  // One approval request (`/approvals/:id`) opens the same detail screen on both surfaces.
  { pattern: /^\/approvals\/[A-Za-z0-9_-]+$/, web: KEEP, mobile: KEEP },
  { pattern: section('/approvals'), web: KEEP, mobile: '/approvals' },
  { pattern: section('/employees'), web: KEEP, mobile: null },
  { pattern: section('/org'), web: KEEP, mobile: '/org' },
  { pattern: section('/notifications'), web: KEEP, mobile: '/notifications' },
  { pattern: section('/settings/holidays'), web: KEEP, mobile: '/holidays' },
  { pattern: section('/settings'), web: KEEP, mobile: null },
  // The signed-in user's own profile (e.g. own document expiring) and the holiday calendar are mobile screens.
  { pattern: /^\/profile$/, web: null, mobile: '/profile' },
  { pattern: /^\/holidays$/, web: null, mobile: '/holidays' },
];

/** Only same-app absolute paths: no scheme, no protocol-relative `//host`, no backslashes or dot segments. */
const isSafeAppPath = (link: string): boolean =>
  link.startsWith('/') && !link.startsWith('//') && !/[\\\s]/.test(link) && !/(^|\/)\.\.?(\/|$|[?#])/.test(link) && link.length <= 512;

/**
 * Screen to open for a notification link on one surface, or `null` when the link is empty, unsafe or
 * has no screen there — the client then stays on (or opens) its notification list (`NOTIFICATIONS_ROUTE`).
 */
export function resolveNotificationLink(link: string | null | undefined, surface: 'mobile'): MobileLinkRoute | null;
export function resolveNotificationLink(link: string | null | undefined, surface: LinkSurface): string | null;
export function resolveNotificationLink(link: string | null | undefined, surface: LinkSurface): string | null {
  if (!link || !isSafeAppPath(link)) return null;
  const rule = LINK_RULES.find((r) => r.pattern.test(link));
  if (!rule) return null;
  const target = rule[surface];
  return target === KEEP ? link : target;
}

// ─────────────────────── SMS (FR-NOTI-02.2/02.3) ───────────────────────

/**
 * Key events that may also go out by SMS when the workspace enabled `notification.smsEnabled`, to
 * recipients who cannot get a push (no registered app device) but have a phone number.
 */
export const SMS_NOTIFICATION_TYPES: readonly NotificationType[] = ['APPROVAL_DECISION', 'DOCUMENT_EXPIRY', 'PROBATION_ENDING'];

export const isSmsNotificationType = (type: NotificationType): boolean => SMS_NOTIFICATION_TYPES.includes(type);

/** i18n key of the SMS template for a notification type (`notif.sms.<TYPE>`; params: the notify params + `title` + `body`). */
export const smsTemplateKey = (type: NotificationType): string => `notif.sms.${type}`;

/**
 * Longest SMS text we send: 160 characters is one GSM-7 segment for Latin text and at most three
 * concatenated UCS-2 segments (3 × 67) for Lao script, which keeps cost and delivery predictable.
 */
export const SMS_MAX_LENGTH = 160;

/** Shorten text to `max` characters (code points), ending with "…" when cut. */
export const fitSmsText = (text: string, max: number = SMS_MAX_LENGTH): string => {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('').trimEnd()}…`;
};
