import multipart from '@fastify/multipart';
import {
  createKioskSchema,
  errorResponseSchema,
  idParamsSchema,
  kioskDeviceSchema,
  kioskEnrolmentSchema,
  kioskInfoSchema,
  kioskListQuerySchema,
  kioskPunchBatchResponseSchema,
  kioskPunchBatchSchema,
  parseKioskAuthorization,
  PERMISSIONS,
  storedFileSchema,
} from '@hrm/shared';
import { z } from 'zod';
import type { AppInstance } from '../../app';
import { unauthorized } from '../../lib/errors';
import { readSingleFile } from '../files/multipart';
import type { KioskContext } from './kiosk.service';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the kiosk scope's `Authorization: Kiosk <token>` hook. */
    kiosk: KioskContext;
  }
}

const errors = { 400: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema };

/** HR management of kiosk tablets (FR-ATT-03.1, FR-WS-06.3): enrol, list, revoke. Registered in the user (JWT) scope. */
export const kioskRoutes = async (app: AppInstance) => {
  const svc = app.services.kiosk;
  const manage = app.requirePermission(PERMISSIONS.KIOSK_MANAGE);

  app.post(
    '/kiosks',
    {
      preHandler: manage,
      schema: {
        description: 'Enrol a kiosk tablet for a branch with KIOSK mode. Returns the enrol code once; only its hash is stored.',
        body: createKioskSchema,
        response: { 201: kioskEnrolmentSchema, ...errors },
      },
    },
    async (req, reply) => reply.code(201).send(await svc.enrol(req.auth, req.body, { ip: req.ip })),
  );

  app.get(
    '/kiosks',
    {
      preHandler: manage,
      schema: { description: 'Kiosk tablets of the workspace with their last-seen time.', querystring: kioskListQuerySchema, response: { 200: z.array(kioskDeviceSchema) } },
    },
    async (req) => svc.list(req.auth, req.query),
  );

  app.post(
    '/kiosks/:id/revoke',
    {
      preHandler: manage,
      schema: { description: 'Revoke a kiosk tablet: its token stops working at once.', params: idParamsSchema, response: { 200: kioskDeviceSchema, ...errors } },
    },
    async (req) => svc.revoke(req.auth, req.params.id, { ip: req.ip }),
  );
};

/**
 * The kiosk tablet's own API (FR-ATT-03). A separate scope with no user JWT: `Authorization: Kiosk <enrol code>`
 * resolves the workspace and branch; a revoked or unknown code answers 401.
 */
export const kioskDeviceRoutes = async (app: AppInstance) => {
  const svc = app.services.kiosk;
  await app.register(multipart, { limits: { fileSize: app.services.files.maxBytes, files: 1, fields: 0, parts: 1 } });
  app.decorateRequest('kiosk', null as unknown as KioskContext);
  app.addHook('onRequest', async (req) => {
    const token = parseKioskAuthorization(req.headers.authorization);
    if (!token) throw unauthorized('kiosk_not_enrolled');
    req.kiosk = await svc.authenticate(token);
  });
  const authErrors = { 401: errorResponseSchema, 403: errorResponseSchema };

  app.get(
    '/kiosk/me',
    { schema: { description: 'The calling kiosk: branch, company, time zone and kiosk parameters.', response: { 200: kioskInfoSchema, ...authErrors } } },
    async (req) => svc.info(req.kiosk),
  );

  app.post(
    '/kiosk/files',
    {
      schema: {
        description: 'Upload the photo taken at a kiosk punch (JPEG/PNG, multipart field `file`); referenced by `selfieFileId`.',
        consumes: ['multipart/form-data'],
        response: { 201: storedFileSchema, 413: errorResponseSchema, 415: errorResponseSchema, ...authErrors },
      },
    },
    async (req, reply) => reply.code(201).send(await svc.uploadPhoto(req.kiosk, await readSingleFile(req))),
  );

  app.post(
    '/kiosk/punches',
    {
      schema: {
        description:
          'Upload punches typed on the kiosk (employee code + PIN + photo). Each item is created, replayed (same clientRef) or rejected with an error code.',
        body: kioskPunchBatchSchema,
        response: { 200: kioskPunchBatchResponseSchema, ...authErrors },
      },
    },
    async (req) => svc.submitPunches(req.kiosk, req.body, { ip: req.ip }),
  );
};
