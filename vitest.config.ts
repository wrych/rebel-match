import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Modules whose only job is I/O are covered by the integration suite
      // (R-QA-2), not here. The boundary is the rule from constitution §4: if a
      // module holds a decision worth testing, it does not belong on this list —
      // the decision belongs in a pure module that this suite does cover.
      exclude: [
        'src/**/*.test.ts',
        'src/server.ts',
        'src/db.ts',
        'src/migrate.ts',
        'src/migrations/run.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
