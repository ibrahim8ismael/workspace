import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE'];
const liveOfficeE2E = process.env['LIVE_OFFICE_E2E'] === '1';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4175',
    headless: true,
    launchOptions: executablePath ? { executablePath } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  ...(liveOfficeE2E
    ? {}
    : {
        webServer: {
          command:
            'pnpm build:packages && pnpm --filter @gather/web dev --host 127.0.0.1 --port 4175 --strictPort',
          url: 'http://127.0.0.1:4175',
          reuseExistingServer: !process.env['CI'],
          timeout: 120_000,
        },
      }),
});
