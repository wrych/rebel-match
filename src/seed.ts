/* eslint-disable no-console -- a command-line tool reports to stdout; the rule
   exists to keep member data out of logs, and counts are not that. */
import { loadRuntimeConfig } from './runtime-config.js'
import { openDatabase } from './db/open.js'
import { planSeed } from './seed/plan.js'
import { applySeed } from './seed/run.js'

const config = await loadRuntimeConfig()
const plan = planSeed(config)
const connection = await openDatabase(config)

try {
  await applySeed(connection.db, plan, config.consentVersion)
  console.log(
    `seed (${config.seedProfile}): ${String(plan.roles.length)} roles, ` +
      `${String(plan.members.length)} members, ` +
      `${String(plan.admins.length)} first admins`,
  )
} finally {
  await connection.close()
}
