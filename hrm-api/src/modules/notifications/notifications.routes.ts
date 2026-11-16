import {
  idParamsSchema,
  markAllReadResponseSchema,
  notificationListQuerySchema,
  notificationSchema,
  paginatedSchema,
  pushTokenSchema,
  registerPushTokenSchema,
  unreadCountSchema,
} from '@hrm/shared';
import { z } from 'zod';
import type { AppInstance } from '../../app';

/** Devices register/unregister right after sign-in, even before the account setup is finished. */
const setupAllowed = { allowDuringAccountSetup: true } as const;

/** Every route here acts on the caller's own notifications/devices only; no extra permission needed. */
export const notificationsRoutes = async (app: AppInstance) => {
  const svc = app.services.notifications;

  app.get(
    '/notifications',
    { schema: { querystring: notificationListQuerySchema, response: { 200: paginatedSchema(notificationSchema) } } },
    async (req) => svc.list(req.auth, req.query),
  );

  app.get('/notifications/unread-count', { schema: { response: { 200: unreadCountSchema } } }, async (req) => svc.unreadCount(req.auth));

  app.post(
    '/notifications/:id/read',
    { schema: { params: idParamsSchema, response: { 200: notificationSchema } } },
    async (req) => svc.markRead(req.auth, req.params.id),
  );

  app.post('/notifications/read-all', { schema: { response: { 200: markAllReadResponseSchema } } }, async (req) => svc.markAllRead(req.auth));

  app.post(
    '/me/push-tokens',
    { config: setupAllowed, schema: { body: registerPushTokenSchema, response: { 201: pushTokenSchema } } },
    async (req, reply) => reply.status(201).send(await svc.registerPushToken(req.auth, req.body)),
  );

  app.delete(
    '/me/push-tokens/:token',
    { config: setupAllowed, schema: { params: z.object({ token: z.string().min(1).max(255) }), response: { 204: z.null() } } },
    async (req, reply) => {
      await svc.removePushToken(req.auth, req.params.token);
      return reply.status(204).send();
    },
  );
};
