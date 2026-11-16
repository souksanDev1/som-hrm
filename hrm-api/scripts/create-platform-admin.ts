/**
 * Create the first SOM platform (super admin) account — production bootstrap for FR-WS-01.1.
 *
 *   pnpm --filter @hrm/api platform:create-admin --email ops@som.la --name "SOM Ops" --password '...'
 *
 * Values may also come from PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_NAME / PLATFORM_ADMIN_PASSWORD
 * (preferred for the password so it does not land in shell history). Refuses to overwrite an
 * existing account. The creation is recorded in PlatformAuditLog.
 */
import { passwordSchema } from '@hrm/shared';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadEnv } from '../src/config/env';
import { createDb } from '../src/db/client';
import { hashSecret } from '../src/lib/password';
import { platformAuditRepository } from '../src/modules/platform/platform.repository';

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' }, password: { type: 'string' } },
});

const input = z
  .object({
    email: z.string().trim().toLowerCase().email('invalid email'),
    displayName: z.string().trim().min(1, 'name is required').max(120),
    password: passwordSchema,
  })
  .safeParse({
    email: values.email ?? process.env.PLATFORM_ADMIN_EMAIL,
    displayName: values.name ?? process.env.PLATFORM_ADMIN_NAME ?? 'SOM Admin',
    password: values.password ?? process.env.PLATFORM_ADMIN_PASSWORD,
  });

if (!input.success) {
  console.error(`Invalid input: ${input.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  process.exit(1);
}

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
try {
  const { email, displayName, password } = input.data;
  const created = await db.system(async (tx) => {
    if (await tx.platformUser.findUnique({ where: { email } })) return null;
    const user = await tx.platformUser.create({ data: { email, displayName, passwordHash: await hashSecret(password) } });
    await platformAuditRepository.create(tx, { actorId: null, action: 'platform.admin.create', entity: 'PlatformUser', entityId: user.id, meta: { email, via: 'cli' } });
    return user;
  });
  if (!created) {
    console.error(`Platform user ${email} already exists — nothing changed`);
    process.exitCode = 1;
  } else {
    console.warn(`Created platform admin ${email}`);
  }
} finally {
  await db.disconnect();
}
