import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// CI provides the environment directly; locally it lives in .env, and without
// this the suite cannot run outside CI at all.
if (existsSync('.env')) process.loadEnvFile('.env')

const onPostgres = (process.env['DATABASE_URL'] ?? '') !== ''

// CI runs this suite twice, once per engine; the job summary's title says which.
const onGithubActions = process.env['GITHUB_ACTIONS'] === 'true'

/**
 * API-level tests (R-QA-2) with mail.delivery=none, so the auth and double
 * opt-in journeys are exercised without sending mail. Each file runs on a
 * database of its own, so files run side by side, started from what the
 * global setup migrates once per run: an in-memory PGlite loaded from a
 * snapshot, or on the Postgres `DATABASE_URL` names, a copy of a template
 * (ADR 0024).
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    ...(onGithubActions && {
      reporters: [
        'default',
        [
          'github-actions',
          {
            jobSummary: {
              title: `Integration tests on ${onPostgres ? 'Postgres' : 'PGlite'}`,
            },
          },
        ],
      ],
    }),
    globalSetup: ['tests/integration/support/global-setup.ts'],
    setupFiles: ['tests/integration/support/setup-file.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      ...(process.env['DATABASE_URL'] === undefined
        ? {}
        : { DATABASE_URL: process.env['DATABASE_URL'] }),
    },
  },
})
