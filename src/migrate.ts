/* eslint-disable no-console -- a command-line tool reports to stdout; the rule
   exists to keep member data out of logs, and migration names are not that. */
import { loadRuntimeConfig } from './runtime-config.js'
import { applyMigrations } from './db/migrate.js'
import { openDatabase } from './db/open.js'

const config = await loadRuntimeConfig()
const connection = await openDatabase(config)

try {
  const applied = await applyMigrations(connection)
  if (applied.length === 0) {
    console.log('migrations: nothing to apply')
  } else {
    console.log(`migrations: applied ${String(applied.length)}`)
    for (const name of applied) console.log(`  ${name}`)
  }
} finally {
  await connection.close()
}
