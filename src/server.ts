/* eslint-disable no-console -- the process entry reports where it is listening;
   the rule exists to keep member data out of logs, and a port is not that. */
import { createApp } from './app.js'
import { composeApp } from './compose.js'
import { loadRuntimeConfig } from './runtime-config.js'
import { openDatabase } from './db/open.js'
import { startOutboxRetention } from './services/outbox-retention.js'
import { startCrownCheck } from './services/crown-check.js'
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
  onBadgeError: () => {
    console.warn('badges: a count failed, the next counted act catches up')
  },
  onScheduledError: () => {
    console.warn('scheduled work: a job failed, will retry at its next turn')
  },
})

// The hosts' changes apply before the first request, then follow other servers
// (ADR 0031).
await deps.settings.refresh()

// What members earned before badges existed, recorded once and quietly
// before the first request (R-BADGE-11).
await deps.badges.awardAtLaunch().catch(() => {
  console.warn('badges: the award at launch failed, will retry next start')
})

// The server's own timers, unless a scheduler's tick runs the same work
// (ADR 0049). Notifications are mailed by a timer, not by the request that
// caused them, and kept as long as the outbound log is purged (R-NOTE-7,
// R-NOTE-11).
function startTimers(): void {
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
}

// Crowns move when counts fall with nobody acting (R-BADGE-3).
function startBadgeTimers(): void {
  startCrownCheck({
    badges: deps.badges,
    intervalMinutes: config.badgeCrownCheckMinutes,
    onError: () => {
      console.warn('badges: the crown check failed, will retry next interval')
    },
  })
}

if (config.scheduledWork.mode === 'timers') {
  startTimers()
  startBadgeTimers()
}

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
  console.log(`  scheduled by:  ${config.scheduledWork.mode}`)
})
