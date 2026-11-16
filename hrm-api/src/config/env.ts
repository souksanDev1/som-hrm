import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** First-login SMS phone verification (FR-AUTH-02.1); auto-disabled in production while only the console SMS sender exists. */
  REQUIRE_PHONE_VERIFICATION: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).default(30),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY must be 32 bytes, base64 encoded'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  /**
   * Fastify `trustProxy`: "false" (default) ignores X-Forwarded-For; "true" trusts every hop;
   * a number trusts that many hops; otherwise a comma-separated list of proxy IPs/CIDRs.
   * Enable only behind a reverse proxy, or clients can spoof their IP and dodge rate limits.
   */
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((v): boolean | number | string[] => {
      const s = v.trim();
      if (s === '' || s === 'false') return false;
      if (s === 'true') return true;
      if (/^\d+$/.test(s)) return Number(s);
      return s.split(',').map((p) => p.trim()).filter(Boolean);
    }),
  /** Sign-in attempts per minute per (IP + company + identifier). */
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  /** All API requests per minute per IP (global limit). */
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  /** Root directory of the local file-storage driver (A7). */
  FILE_STORAGE_DIR: z.string().default('uploads'),
  /** Maximum accepted upload size in bytes. */
  FILE_MAX_BYTES: z.coerce.number().int().min(1).default(10 * 1024 * 1024),
  /** Serve OpenAPI JSON + Swagger UI at /docs; defaults to on outside production. */
  API_DOCS: z.enum(['true', 'false']).optional(),
  /** Push provider for notification deliveries; `none` marks push deliveries SKIPPED. */
  PUSH_PROVIDER: z.enum(['expo', 'none']).default('none'),
  /** Optional Expo access token (enhanced push security). */
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** Delivery attempts before a push/SMS delivery is marked FAILED (FR-NOTI-04.5). */
  DELIVERY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
});

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
};
