/* eslint-disable no-console -- a command-line tool reports to stdout; the rule
   exists to keep member data out of logs, and migration names are not that. */
import { loadConfig } from './config.js'
import { migrate } from './migrations/run.js'

const config = loadConfig()
const applied = await migrate(config.databaseUrl, 'migrations')

if (applied.length === 0) {
  console.log('migrations: nothing to apply')
} else {
  console.log(`migrations: applied ${String(applied.length)}`)
  for (const name of applied) console.log(`  ${name}`)
}
