/**
 * Check-in load test (NFR, client Q9: 1,000 check-ins within 60 s, p95 < 500 ms, local).
 *
 *   pnpm --filter @hrm/api load:checkin seed    # wipe + migrate + seed the *_load database (N employees)
 *   pnpm --filter @hrm/api load:checkin serve   # API on LOAD_PORT against that database (run in another shell)
 *   pnpm --filter @hrm/api load:checkin run     # fire N distinct check-ins, then replay them all once
 *
 * Environment: LOAD_DATABASE_URL (must end in `_load`), LOAD_EMPLOYEES (1000), LOAD_CONCURRENCY (50),
 * LOAD_PORT (4200), LOAD_API_URL (http://127.0.0.1:LOAD_PORT/api/v1), LOAD_JWT_SECRET (shared by serve and run).
 * Access tokens are minted with @fastify/jwt and the server's secret, exactly like the auth plugin signs them.
 * Not part of `pnpm test`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import fastifyJwt from '@fastify/jwt';
import type { PunchBatchInput, PunchBatchResponse } from '@hrm/shared';
import Fastify from 'fastify';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createDb } from '../src/db/client';
import { assertLoadDatabase, LOAD_BRANCH, LOAD_PLATFORM, seedLoadDatabase } from './load-seed';

const DATABASE_URL = process.env.LOAD_DATABASE_URL ?? 'postgresql://hrm:hrm@localhost:5432/hrm_m5h_load?schema=public';
const EMPLOYEES = Number(process.env.LOAD_EMPLOYEES ?? 1000);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 50);
const PORT = Number(process.env.LOAD_PORT ?? 4200);
const API_URL = process.env.LOAD_API_URL ?? `http://127.0.0.1:${PORT}/api/v1`;
const JWT_SECRET = process.env.LOAD_JWT_SECRET ?? 'load-test-secret-load-test-secret-0001';
/** Client Q9 targets. */
const TARGET_SECONDS = 60;
const TARGET_P95_MS = 500;

assertLoadDatabase(DATABASE_URL);

/** Report lines go to stdout (the API's lint rule reserves console for warnings and errors). */
const log = (line: string) => process.stdout.write(`${line}\n`);

const serve = async () => {
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL,
    JWT_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? randomBytes(32).toString('base64'),
    PORT: String(PORT),
    HOST: '127.0.0.1',
    API_DOCS: 'false',
    // Every simulated phone shares 127.0.0.1 here; in production they come from many IPs.
    RATE_LIMIT_MAX: '1000000',
  });
  const db = createDb(env.DATABASE_URL);
  const app = await buildApp({ env, db, logger: false });
  const stop = async () => {
    await app.close();
    await db.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
  await app.listen({ port: env.PORT, host: env.HOST });
  log(`load API listening on http://${env.HOST}:${env.PORT} (db ${new URL(DATABASE_URL).pathname.slice(1)})`);
};

interface Shot {
  ms: number;
  status: number;
  results: string[];
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;

const fire = async (label: string, requests: { token: string; body: PunchBatchInput }[]) => {
  const shots: Shot[] = [];
  let next = 0;
  const started = performance.now();
  const worker = async () => {
    while (next < requests.length) {
      const { token, body } = requests[next++]!;
      const t0 = performance.now();
      let status = 0;
      let results: string[] = [];
      try {
        const res = await fetch(`${API_URL}/attendance/punches`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        status = res.status;
        const json = (await res.json()) as PunchBatchResponse;
        results = res.ok ? json.results.map((r) => (r.result === 'rejected' ? `rejected:${r.error}` : r.result)) : [];
      } catch {
        status = 0;
      }
      shots.push({ ms: performance.now() - t0, status, results });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const seconds = (performance.now() - started) / 1000;
  const sorted = shots.map((s) => s.ms).sort((a, b) => a - b);
  const outcomes = new Map<string, number>();
  for (const s of shots) for (const r of s.status === 200 ? s.results : [`http:${s.status}`]) outcomes.set(r, (outcomes.get(r) ?? 0) + 1);
  const errors = shots.filter((s) => s.status !== 200).length;
  const p95 = percentile(sorted, 95);
  log(`\n── ${label}: ${shots.length} requests, concurrency ${CONCURRENCY}`);
  log(`   wall time   ${seconds.toFixed(2)} s   throughput ${(shots.length / seconds).toFixed(1)} req/s`);
  log(
    `   latency ms  p50 ${percentile(sorted, 50).toFixed(1)}  p95 ${p95.toFixed(1)}  p99 ${percentile(sorted, 99).toFixed(1)}  max ${sorted[sorted.length - 1]!.toFixed(1)}`,
  );
  log(`   HTTP errors ${errors}   outcomes ${JSON.stringify(Object.fromEntries(outcomes))}`);
  log(`   target      ${seconds <= TARGET_SECONDS && p95 < TARGET_P95_MS && errors === 0 ? 'PASS' : 'FAIL'} (≤ ${TARGET_SECONDS} s, p95 < ${TARGET_P95_MS} ms, 0 errors)`);
  return { seconds, p95, errors };
};

const run = async () => {
  const db = createDb(DATABASE_URL);
  const users = await db.system((tx) =>
    tx.user.findMany({
      where: { workspace: { code: 'load' }, employeeId: { not: null } },
      select: { id: true, workspaceId: true, devices: { where: { isActive: true }, select: { deviceId: true } } },
      orderBy: { email: 'asc' },
      take: EMPLOYEES,
    }),
  );
  await db.disconnect();
  if (users.length < EMPLOYEES) throw new Error(`Only ${users.length} load users found; run "load:checkin seed" first`);

  const signer = Fastify();
  await signer.register(fastifyJwt, { secret: JWT_SECRET, sign: { expiresIn: '1h' } });
  await signer.ready();

  const now = new Date();
  const requests = users.map((u, i) => ({
    token: signer.jwt.sign({ sub: u.id, ws: u.workspaceId }),
    body: {
      deviceId: u.devices[0]!.deviceId,
      platform: LOAD_PLATFORM,
      deviceSentAt: now.toISOString(),
      items: [
        {
          clientRef: randomUUID(),
          kind: 'IN' as const,
          capturedAt: new Date(now.getTime() - (i % 60) * 1000).toISOString(),
          // Spread inside the geofence (≤ ~50 m north of the branch).
          latitude: LOAD_BRANCH.latitude + (i % 50) * 0.00001,
          longitude: LOAD_BRANCH.longitude,
          accuracyMetres: 10,
          mocked: false,
          offline: false,
        },
      ],
    },
  }));
  await signer.close();

  // Warm-up (not measured): open the server's database pool with CONCURRENCY parallel health checks, as a
  // long-running API would have. Check-in paths stay cold (every user's first request still misses the auth cache).
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let i = 0; i < 4; i++) await fetch(API_URL.replace(/\/api\/v1$/, '/health')).then((r) => r.arrayBuffer());
    }),
  );

  const first = await fire(`check-in (${EMPLOYEES} distinct punches)`, requests);
  // Refresh deviceSentAt so the replay is not judged on clock skew; the clientRefs stay the same.
  const replay = await fire('idempotent replay (same clientRefs)', requests.map((r) => ({ ...r, body: { ...r.body, deviceSentAt: new Date().toISOString() } })));
  if (first.errors || replay.errors) process.exitCode = 1;
};

const command = process.argv[2];
if (command === 'seed') {
  const t0 = performance.now();
  const fixture = await seedLoadDatabase(DATABASE_URL, EMPLOYEES);
  log(`seeded ${fixture.userIds.length} employees in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
} else if (command === 'serve') {
  await serve();
} else if (command === 'run') {
  await run();
} else {
  console.error('usage: load-checkin.ts seed | serve | run');
  process.exitCode = 1;
}
