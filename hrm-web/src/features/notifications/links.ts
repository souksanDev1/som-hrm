/** Web routes a notification link may open; other links (e.g. mobile-only `/profile`) are not navigable here. */
const WEB_ROUTE_PREFIXES = ['/dashboard', '/employees', '/org', '/notifications', '/settings', '/approvals'] as const;

export const resolveWebLink = (link: string | null | undefined): string | null => {
  if (!link || !link.startsWith('/') || link.startsWith('//')) return null;
  return WEB_ROUTE_PREFIXES.some((p) => link === p || link.startsWith(`${p}/`)) ? link : null;
};
