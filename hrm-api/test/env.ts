import { randomBytes } from 'node:crypto';
import { loadEnv } from '../src/config/env';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://hrm:hrm@localhost:5432/hrm_test?schema=public';

export const testEnv = (overrides: Record<string, string> = {}) =>
  loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    LOGIN_MAX_ATTEMPTS: '3',
    LOGIN_RATE_LIMIT: '1000',
    ...overrides,
  });
