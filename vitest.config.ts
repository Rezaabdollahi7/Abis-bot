import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/*/src/**/*.test.{ts,tsx}', 'packages/*/src/**/*.test.ts'],
    // Server tests share one real PostgreSQL test database and truncate it between tests.
    fileParallelism: false,
  },
});
