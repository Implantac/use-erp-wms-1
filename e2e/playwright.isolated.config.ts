import { defineConfig, devices } from '@playwright/test';

/**
 * QA-01 — suíte E2E sobre o ambiente isolado (scripts/e2e-isolated-server.mjs).
 *
 * Nenhum segredo, nenhuma rede externa e nenhum `skip`: o Playwright sobe o
 * Postgres embarcado, reaplica as 504 migrations + seeds e o derruba ao fim.
 * As constantes abaixo sao deliberadamente publicas: sao as coordenadas de
 * um servidor que so escuta em 127.0.0.1 e e destruido a cada execucao.
 */
Object.assign(process.env, {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-isolated-anon-key',
  E2E_ADMIN_EMAIL: 'etcsuporte889@gmail.com',
  E2E_ADMIN_PASSWORD: 'SenhaTeste123',
  E2E_ISOLATED_MARKER: 'QA-01-ISOLATED-E2E',
});

export default defineConfig({
  testDir: '..',
  testMatch: [
    'tests/e2e/isolated-environment.spec.ts',
    'tests/e2e/isolated-store-journey.spec.ts',
    'tests/e2e/isolated-store-chain.spec.ts',
    'tests/e2e/isolated-role-separation.spec.ts',
    'tests/e2e/isolated-production-completion.spec.ts',
    'tests/e2e/isolated-tenant-isolation.spec.ts',
    'tests/e2e/isolated-production-rls-finding.spec.ts',
    'tests/e2e/production-golden-path.spec.ts',
    'tests/e2e/sales-golden-path.spec.ts',
    'tests/e2e/purchase-golden-path.spec.ts',
  ],
  globalTeardown: './isolated-global-teardown.ts',
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [
    ['html', { outputFolder: '../playwright-report-isolated', open: 'never' }],
    ['json', { outputFile: 'test-results/isolated-results.json' }],
    ['list'],
    ['./fail-on-skipped-reporter.ts'],
  ],
  outputDir: 'test-results/isolated-artifacts',
  use: {
    baseURL: 'http://127.0.0.1:54321',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'node scripts/e2e-isolated-server.mjs',
    cwd: '..',
    url: 'http://127.0.0.1:54321/auth/v1/health',
    reuseExistingServer: false,
    timeout: 180 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [{ name: 'isolated', use: { ...devices['Desktop Chrome'] } }],
});
