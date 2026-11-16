/**
 * Background worker process (A6). Run with `pnpm --filter @hrm/api worker`.
 * The API process never starts jobs; deploy this as a separate process next to it.
 */
import { loadEnv } from './config/env';
import { createDb } from './db/client';
import { registerJobs } from './jobs';
import { createJobRunner } from './jobs/runner';
import { createConsoleSmsSender } from './lib/sms';
import { createPushSender } from './modules/notifications/push';

const log = (msg: string, meta?: object) => {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), msg, ...meta })}\n`);
};

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const runner = createJobRunner(env.DATABASE_URL, log);

await runner.start();
await registerJobs({
  db,
  runner,
  push: createPushSender(env.PUSH_PROVIDER, env.EXPO_ACCESS_TOKEN),
  sms: createConsoleSmsSender((m) => log(m)),
  deliveryMaxAttempts: env.DELIVERY_MAX_ATTEMPTS,
  log,
});
log('worker started', { push: env.PUSH_PROVIDER });

const shutdown = async (signal: string) => {
  log('worker shutting down', { signal });
  await runner.stop();
  await db.disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
