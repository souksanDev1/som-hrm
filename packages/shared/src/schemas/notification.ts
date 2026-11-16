import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../enums';
import { paginationQuerySchema } from './common';

/** In-app notification as shown in the notification center (title/body already rendered in the user's language). */
export const notificationSchema = z.object({
  id: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string(),
  /** In-app route to open, e.g. `/employees/abc` (FR-NOTI-04.2). */
  link: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationItem = z.infer<typeof notificationSchema>;

export const notificationListQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  /** `?unread=true` lists unread notifications only. */
  unread: z.preprocess((v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : v), z.boolean().optional()),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const unreadCountSchema = z.object({ count: z.number().int() });
export type UnreadCount = z.infer<typeof unreadCountSchema>;

export const markAllReadResponseSchema = z.object({ updated: z.number().int() });

export const PUSH_PLATFORMS = ['IOS', 'ANDROID', 'WEB'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export const registerPushTokenSchema = z.object({
  token: z.string().trim().min(1, 'required').max(255),
  platform: z.enum(PUSH_PLATFORMS),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const pushTokenSchema = z.object({ token: z.string(), platform: z.enum(PUSH_PLATFORMS), createdAt: z.string() });

/** A template parameter: plain text/number, or a translation key rendered in the recipient's language. */
export type MessageParam = string | number | { t: string };

/** Replace `{name}` placeholders; unknown placeholders are left as-is. */
export const interpolate = (template: string, params: Readonly<Record<string, string | number>> = {}): string =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
