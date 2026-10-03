import { defineConfig } from 'drizzle-kit'

// drizzle-kit only generates migrations from the schema; our own runner
// applies them, with its forward-only rules (ADR 0024, constitution §6).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './db/migrations',
  migrations: { prefix: 'index' },
})
