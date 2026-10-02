import { defineConfig } from 'vitest/config'

/**
 * API-level tests (R-QA-2): a disposable MySQL and mail.transport=outbox, so
 * the auth and double opt-in journeys are exercised without sending mail.
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
