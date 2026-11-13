import { buildApp } from './app';
import { loadEnv } from './config/env';
import { createDb } from './db/client';

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app = await buildApp({ env, db });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await db.disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: env.PORT, host: env.HOST });
