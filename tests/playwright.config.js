import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  timeout: 30_000,
  retries: 0,
  workers: 1, // sequential — single server instance
  use: {
    baseURL: 'http://localhost:1072',
    headless: true,
    viewport: { width: 1400, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    bypassCSP: true, // CSP upgrade-insecure-requests blocks http://localhost scripts in headless
  },
  webServer: {
    command: 'lsof -ti:1072 | xargs kill 2>/dev/null; exec node src/index.js',
    cwd: '../cloud',
    port: 1072,
    reuseExistingServer: false,
    timeout: 15_000,
    env: {
      NODE_ENV: 'development',
      PORT: '1072',
      DATABASE_PATH: './data/test-e2e.db',
    },
  },
  outputDir: './test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: './test-report' }]],
});
