import { defineConfig, devices } from '@playwright/test';

// Smoke sem backend: servidor dedicado e credenciais deliberadamente inválidas.
export default defineConfig({
  testDir: './public',
  timeout: 40_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4179', trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:1', VITE_SUPABASE_PUBLISHABLE_KEY: 'offline-test-key' },
  },
});
