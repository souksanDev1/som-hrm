import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { createJsonSchemaTransform } from 'fastify-type-provider-zod';
import type { Env } from '../config/env';

export const DOCS_PREFIX = '/docs';

/** API docs default to on outside production; API_DOCS=true|false overrides. */
export const apiDocsEnabled = (env: Pick<Env, 'API_DOCS' | 'NODE_ENV'>): boolean =>
  env.API_DOCS ? env.API_DOCS === 'true' : env.NODE_ENV !== 'production';

/**
 * OpenAPI 3 document generated from the routes' Zod schemas (A8, NFR-09): JSON at /docs/json,
 * Swagger UI at /docs. Must be registered before any route so every route is collected.
 */
export const registerOpenApi = async (app: FastifyInstance) => {
  await app.register(swagger, {
    openapi: {
      info: { title: 'SOM HRM API', version: '1.0.0', description: 'Tenant API. Errors use `{ error: { code, message, details } }`.' },
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      security: [{ bearerAuth: [] }],
    },
    transform: createJsonSchemaTransform({
      skipList: [DOCS_PREFIX, `${DOCS_PREFIX}/`, `${DOCS_PREFIX}/json`, `${DOCS_PREFIX}/yaml`, `${DOCS_PREFIX}/static/*`, `${DOCS_PREFIX}/*`],
    }),
  });
  await app.register(swaggerUi, { routePrefix: DOCS_PREFIX, staticCSP: true });
};
