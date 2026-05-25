import { defineConfig, devices } from '@playwright/test';

// E2E config — defaults to hitting the production Vercel deploy so the
// suite doubles as a synthetic monitor. Override with PLAYWRIGHT_BASE_URL
// to run against localhost:3000 during development:
//   PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm test:e2e

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? 'https://sha-nadc-platform-web.vercel.app';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
