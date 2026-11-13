import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // Bundle the TS-source workspace package; keep real npm deps external.
  noExternal: ['@hrm/shared'],
});
