/* eslint-disable no-console -- a command-line tool reports to stdout; the rule
   exists to keep member data out of logs, and counts are not that. */
import { loadConfig } from './config.js'
import { openDatabase } from './db/open.js'
import { planSeed } from './seed/plan.js'
import { applySeed } from './seed/run.js'

const config = loadConfig()
const plan = planSeed(config)
const connection = await openDatabase(config)

try {
  await applySeed(connection.db, plan, config.consentVersion)
  console.log(
    `seed (${config.seedProfile}): ${String(plan.roles.length)} roles, ` +
      `${String(plan.members.length)} members`,
  )
} finally {
  await connection.close()
}
