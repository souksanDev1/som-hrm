import PgBoss from 'pg-boss';

/**
 * Thin wrapper over pg-boss (architecture A6): jobs live in the existing PostgreSQL
 * (schema `pgboss`), no Redis needed. Handlers are plain async functions so tests can call
 * them directly with a Db; only the worker process (src/worker.ts) talks to pg-boss.
 */
export interface JobOptions {
  /** De-duplicates queued jobs: with the default `stately` policy only one job per key waits at a time. */
  singletonKey?: string;
  retryLimit?: number;
  retryDelaySeconds?: number;
  startAfterSeconds?: number;
}

export interface JobRunner {
  /** Create the queue (idempotent) and start consuming it. */
  register<T extends object>(name: string, handler: (data: T) => Promise<void>, opts?: { concurrency?: number }): Promise<void>;
  /** Cron schedule (one schedule per queue name); `tz` defaults to Asia/Vientiane. */
  schedule(name: string, cron: string, data?: object, opts?: { tz?: string }): Promise<void>;
  send(name: string, data: object, opts?: JobOptions): Promise<string | null>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

const DEFAULT_TZ = 'Asia/Vientiane';

/** pg does not understand Prisma's `?schema=` parameter; drop it from the URL. */
const toPgConnectionString = (databaseUrl: string): string => {
  const url = new URL(databaseUrl);
  url.searchParams.delete('schema');
  return url.toString();
};

export const createJobRunner = (databaseUrl: string, log: (msg: string, meta?: object) => void = () => undefined): JobRunner => {
  const boss = new PgBoss({ connectionString: toPgConnectionString(databaseUrl), schema: 'pgboss', application_name: 'hrm-worker' });
  boss.on('error', (err) => log('pg-boss error', { err }));
  const created = new Set<string>();

  const ensureQueue = async (name: string) => {
    if (created.has(name)) return;
    if (!(await boss.getQueue(name))) await boss.createQueue(name, { name, policy: 'stately', retryLimit: 3, retryDelay: 60, retryBackoff: true });
    created.add(name);
  };

  return {
    async start() {
      await boss.start();
    },
    async stop() {
      await boss.stop({ graceful: true, timeout: 20_000 });
    },
    async register(name, handler, opts = {}) {
      await ensureQueue(name);
      await boss.work<object>(name, { batchSize: opts.concurrency ?? 1 }, async (jobs) => {
        for (const job of jobs) {
          await handler(job.data as Parameters<typeof handler>[0]);
        }
      });
    },
    async schedule(name, cron, data = {}, opts = {}) {
      await ensureQueue(name);
      await boss.schedule(name, cron, data, { tz: opts.tz ?? DEFAULT_TZ });
    },
    async send(name, data, opts = {}) {
      await ensureQueue(name);
      // pg-boss validates present keys, so leave unset options out instead of passing undefined.
      const options: PgBoss.SendOptions = {};
      if (opts.singletonKey !== undefined) options.singletonKey = opts.singletonKey;
      if (opts.retryLimit !== undefined) options.retryLimit = opts.retryLimit;
      if (opts.retryDelaySeconds !== undefined) options.retryDelay = opts.retryDelaySeconds;
      if (opts.startAfterSeconds !== undefined) options.startAfter = opts.startAfterSeconds;
      return boss.send(name, data, options);
    },
  };
};
