import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: '..',
  testMatch: [
    'e2e/tests/**/*.test.ts',
    'tests/e2e/**/*.spec.ts',
  ],
  // QA-03: as suites abaixo so existem sobre o Postgres EMBARCADO (subido por
  // scripts/e2e-isolated-server.mjs) e nao podem ser executadas contra
  // homologacao/producao. Rodam exclusivamente em playwright.isolated.config.ts.
  testIgnore: [
    'tests/e2e/isolated-*.spec.ts',
    'tests/e2e/production-golden-path.spec.ts',
    'tests/e2e/sales-golden-path.spec.ts',
    'tests/e2e/purchase-golden-path.spec.ts',
  ],
  /* Maximum time one test can run for. */
  timeout: 30 * 1000,
  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     * For example in `await expect(locator).toHaveText();`
     */
    timeout: 5000
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
    ['list'],
    ...(process.env.E2E_REQUIRE_ALL === '1' ? [['./fail-on-skipped-reporter.ts'] as [string]] : []),
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    viewport: { width: 1280, height: 720 },
  },

  /* Run your local dev server before starting the tests */
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
