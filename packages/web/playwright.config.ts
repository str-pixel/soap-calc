import { defineConfig } from '@playwright/test';

/**
 * Browser-driven end-to-end tests for the recipe UI.
 *
 *   npm run test:e2e -w @soap-calc/web
 *
 * First-time setup on a fresh machine or CI (downloads the matching browser):
 *   npx playwright install chromium
 *
 * The web dev server is started automatically on port 5199.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
