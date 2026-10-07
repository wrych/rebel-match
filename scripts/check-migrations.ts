import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { MIGRATIONS_DIR, readMigrations } from '../src/db/migrate.js'
import { assertMigrationsKept, type Migration } from '../src/migrations/plan.js'

// Compares the working tree's migrations with those at the revision given, the
// pull request's base or main before a push, and fails if one was edited or
// removed (constitution §6, ADR 0044).
const git = async (...args: string[]): Promise<string> =>
  (await promisify(execFile)('git', args)).stdout

async function migrationsAt(revision: string): Promise<Migration[]> {
  const paths = (
    await git('ls-tree', '--name-only', `${revision}:${MIGRATIONS_DIR}`)
  )
    .split('\n')
    .filter((name) => name.endsWith('.sql'))
  return Promise.all(
    paths.map(async (name) => ({
      name,
      sql: await git('show', `${revision}:${MIGRATIONS_DIR}/${name}`),
    })),
  )
}

const revision = process.argv[2]
if (revision === undefined || revision === '') {
  throw new Error('usage: check-migrations <base revision>')
}
assertMigrationsKept(
  await migrationsAt(revision),
  await readMigrations(MIGRATIONS_DIR),
)
