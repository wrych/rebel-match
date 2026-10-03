/* eslint-disable no-console -- the process entry reports where it is listening;
   the rule exists to keep member data out of logs, and a port is not that. */
import { createApp } from './app.js'
import { composeApp } from './compose.js'
import { loadConfig } from './config.js'
import { createPool } from './db.js'
import { startOutboxRetention } from './services/outbox-retention.js'

const config = loadConfig()
const deps = composeApp(config, createPool(config))

startOutboxRetention({
  log: deps.outbox,
  retentionDays: config.limits.outboxRetentionDays,
  intervalHours: config.outboxPurgeIntervalHours,
  onError: () => {
    console.warn('outbox retention: purge failed, will retry next interval')
  },
})

createApp(deps).listen(config.port, () => {
  console.log(`rebel-match server on http://localhost:${String(config.port)}`)
  console.log(`  mail delivery: ${config.mail.delivery}`)
  console.log(`  seed profile:  ${config.seedProfile}`)
})
