import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// CI runs three suites, and each adds to the run's summary; without a
// title of its own, all three read "Vitest Test Report".
const onGithubActions = process.env['GITHUB_ACTIONS'] === 'true'

// The modules R-QA-1 names, held to constitution §2's 90% branch floor each.
const criticalModules = [
  'src/services/matcher.ts',
  'src/auth/tokens.ts',
  'src/auth/provider.ts',
  'src/permissions.ts',
  'src/access.ts',
  'src/services/connections.ts',
  'src/routes.ts',
  'src/config.ts',
  'src/limits.ts',
  'src/setting-specs.ts',
  'src/routes/challenges.ts',
  'src/routes/swipes.ts',
]
const CRITICAL_BRANCH_FLOOR = 90

export default defineConfig({
  plugins: [vue()],
  test: {
    ...(onGithubActions && {
      reporters: [
        'default',
        ['github-actions', { jobSummary: { title: 'Unit tests' } }],
      ],
    }),
    include: [
      'src/**/*.test.ts',
      'client/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'client/**/*.ts', 'client/**/*.vue'],
      // Modules whose only job is I/O are covered by the integration suite
      // (R-QA-2), not here. The boundary is the rule from constitution §4: if a
      // module holds a decision worth testing, it does not belong on this list —
      // the decision belongs in a pure module that this suite does cover.
      exclude: [
        'src/**/*.test.ts',
        'src/server.ts',
        'src/compose.ts',
        'src/dev-login.ts',
        'src/db/open.ts',
        'src/db/schema.ts',
        'src/db/connect.ts',
        'src/migrate.ts',
        'src/seed.ts',
        'src/seed/run.ts',
        'src/auth/db-store.ts',
        'src/services/outbox-store.ts',
        'src/services/role-grant-store.ts',
        'src/services/outbox-log-store.ts',
        'src/services/admission-store.ts',
        'src/services/smtp.ts',
        'client/main.ts',
        'client/router.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        ...Object.fromEntries(
          criticalModules.map((file) => [
            file,
            { branches: CRITICAL_BRANCH_FLOOR },
          ]),
        ),
      },
    },
  },
})
