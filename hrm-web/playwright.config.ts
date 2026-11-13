import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 3100;
const API_PORT = 4100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @hrm/api e2e:server',
      url: `http://127.0.0.1:${API_PORT}/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: { E2E_API_PORT: String(API_PORT), E2E_WEB_ORIGIN: `http://localhost:${WEB_PORT}` },
    },
    {
      command: `pnpm build && pnpm next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_URL: `http://127.0.0.1:${API_PORT}/api/v1`, NEXT_DIST_DIR: '.next-e2e' },
    },
  ],
});
