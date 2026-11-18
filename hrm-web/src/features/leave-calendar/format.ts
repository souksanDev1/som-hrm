import type { Locale } from '@hrm/shared';

const intl = (locale: Locale) => (locale === 'lo' ? 'lo-LA' : 'en-GB');
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "Wed 4 Dec 2030" style label of an ISO date. */
export const formatLongDate = (iso: string, locale: Locale) =>
  utc(iso).toLocaleDateString(intl(locale), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Short weekday name ("Mon"). */
export const formatWeekday = (iso: string, locale: Locale) => utc(iso).toLocaleDateString(intl(locale), { weekday: 'short', timeZone: 'UTC' });

/** "December 2030" label of a month (any date in it). */
export const formatMonth = (iso: string, locale: Locale) => utc(iso).toLocaleDateString(intl(locale), { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "2 – 8 Dec 2030" label of a range. */
export const formatRange = (from: string, to: string, locale: Locale) =>
  `${utc(from).toLocaleDateString(intl(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${formatLongDate(to, locale)}`;

/** Localized name of anything with nameLo / nameEn. */
export const localName = (x: { nameLo: string; nameEn: string }, locale: Locale) => (locale === 'lo' ? x.nameLo : x.nameEn);
