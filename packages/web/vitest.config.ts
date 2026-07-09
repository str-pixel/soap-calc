import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Unit tests only. Playwright browser specs live in e2e/ (run via `test:e2e`).
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
