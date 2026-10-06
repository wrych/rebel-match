/* eslint-disable no-console -- the process entry reports where it is listening;
   the rule exists to keep member data out of logs, and a port is not that. */
import { createApp } from './app.js'
import { composeApp } from './compose.js'
import { loadRuntimeConfig } from './runtime-config.js'
import { openDatabase } from './db/open.js'
import { startOutboxRetention } from './services/outbox-retention.js'
import { startTokenPurge } from './services/token-purge.js'
import { startErasureSweep } from './services/erasure-sweep.js'
import { startSettingsRefresh } from './services/settings-refresh.js'
import { startNotificationWorker } from './services/notification-worker.js'

const config = await loadRuntimeConfig()
const connection = await openDatabase(config)
const deps = composeApp(config, connection.db, {
  onAnalyticsError: () => {
    console.warn('analytics: an event could not be sent')
  },
  onNotificationError: () => {
    console.warn('notifications: one could not be mailed, will retry')
  },
})

// The hosts' changes apply before the first request, then follow other servers
// (ADR 0031).
await deps.settings.refresh()
startSettingsRefresh({
  settings: deps.settings,
  intervalSeconds: config.settingsRefreshSeconds,
  onError: () => {
    console.warn('settings: refresh failed, keeping the values in force')
  },
})

startErasureSweep({
  erasure: deps.erasure,
  intervalHours: config.erasureSweepIntervalHours,
  onError: () => {
    console.warn('erasure sweep: failed, will retry next interval')
  },
})

startTokenPurge({
  auth: deps.auth,
  intervalHours: config.tokenPurgeIntervalHours,
  onError: () => {
    console.warn('token purge: failed, will retry next interval')
  },
})

startOutboxRetention({
  log: deps.outbox,
  retentionDays: config.limits.outboxRetentionDays,
  intervalHours: config.outboxPurgeIntervalHours,
  onError: () => {
    console.warn('outbox retention: purge failed, will retry next interval')
  },
})

// Notifications are mailed by this timer, not by the request that caused
// them, and kept as long as the outbound log is purged (R-NOTE-7, R-NOTE-11).
startNotificationWorker({
  worker: deps.notificationMail,
  intervalSeconds: config.notificationWorker.intervalSeconds,
  onError: () => {
    console.warn('notifications: the worker failed, will retry next interval')
  },
})

startOutboxRetention({
  log: deps.notificationMail,
  retentionDays: config.limits.notificationRetentionDays,
  intervalHours: config.outboxPurgeIntervalHours,
  onError: () => {
    console.warn(
      'notification retention: purge failed, will retry next interval',
    )
  },
})

// Close the database before exiting, so a local PGlite folder is released
// for the restart `tsx watch` is about to make (ADR 0024).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void connection.close().finally(() => process.exit(0))
  })
}

createApp(deps).listen(config.port, () => {
  console.log(`rebel-match server on http://localhost:${String(config.port)}`)
  console.log(`  mail delivery: ${config.mail.delivery}`)
  console.log(`  seed profile:  ${config.seedProfile}`)
  console.log(`  database:      ${config.database.kind}`)
})
