import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
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
        'src/db.ts',
        'src/migrate.ts',
        'src/seed.ts',
        'src/seed/run.ts',
        'src/migrations/run.ts',
        'src/auth/mysql-store.ts',
        'src/services/outbox-store.ts',
        'src/services/smtp.ts',
        'client/main.ts',
        'client/router.ts',
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
