import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// CI provides the environment directly; locally it lives in .env, and without
// this the suite cannot run outside CI at all.
if (existsSync('.env')) process.loadEnvFile('.env')

const onPostgres = (process.env['DATABASE_URL'] ?? '') !== ''

/**
 * API-level tests (R-QA-2) with mail.delivery=none, so the auth and double
 * opt-in journeys are exercised without sending mail. Each file runs on a
 * fresh in-memory PGlite, so files run side by side, or on the Postgres
 * `DATABASE_URL` names, which they share, so one at a time (ADR 0024).
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: !onPostgres,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      ...(process.env['DATABASE_URL'] === undefined
        ? {}
        : { DATABASE_URL: process.env['DATABASE_URL'] }),
    },
  },
})
