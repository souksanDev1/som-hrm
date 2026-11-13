import { Prisma } from '@prisma/client';
import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors';

const body = (code: string, message: string, details?: unknown) => ({ error: { code, message, details } });

/** Maps every thrown error onto the `{ error: { code, message, details } }` contract. */
export const registerErrorHandler = (app: FastifyInstance) => {
  app.setNotFoundHandler((_req, reply) => reply.status(404).send(body('not_found', 'Route not found')));

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(body(err.code, err.message, err.details));
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      const details = err.validation.map((v) => ({
        path: v.instancePath.replace(/^\//, '').replace(/\//g, '.'),
        message: v.message,
      }));
      return reply.status(400).send(body('validation_error', 'Invalid request', details));
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return reply.status(409).send(body('conflict', 'Duplicate value', err.meta));
      if (err.code === 'P2025') return reply.status(404).send(body('not_found', 'Record not found'));
    }
    if (err.statusCode === 429) return reply.status(429).send(body('rate_limited', 'Too many requests'));
    if (isResponseSerializationError(err)) {
      req.log.error({ err, issues: err.cause.issues }, 'response serialization failed');
      return reply.status(500).send(body('internal_error', 'Internal server error'));
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send(body(err.code ?? 'bad_request', err.message));
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send(body('internal_error', 'Internal server error'));
  });
};
