import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const apiRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Run the Prisma CLI directly with Node (not through `pnpm`), so nested
 * invocations don't inherit pnpm's recursive-run environment.
 */
export const runPrisma = (args: string[], env: NodeJS.ProcessEnv) =>
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], { cwd: apiRoot, stdio: 'inherit', env });

/** Run a TypeScript file with tsx (resolved from node_modules). */
export const runTsx = (file: string, env: NodeJS.ProcessEnv) =>
  execFileSync(process.execPath, [require.resolve('tsx/cli'), file], { cwd: apiRoot, stdio: 'inherit', env });
