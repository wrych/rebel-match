/* eslint-disable no-console -- the process entry reports where it is listening;
   the rule exists to keep member data out of logs, and a port is not that. */
import { createApp } from './app.js'
import { composeApp } from './compose.js'
import { loadRuntimeConfig } from './runtime-config.js'
import { openDatabase } from './db/open.js'
import { startEvery, timerJobs } from './services/scheduled-jobs.js'

const MS_PER_SECOND = 1000

const config = await loadRuntimeConfig()
const connection = await openDatabase(config, () => {
  console.warn('database: an idle connection dropped, the pool opens another')
})
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

// The server's own timers run the tick's jobs and the settings refresh,
// unless a scheduler's tick runs the same work (ADR 0049).
if (config.scheduledWork.mode === 'timers') {
  startEvery(timerJobs(config, deps), {
    everyTickMs: config.notificationWorker.intervalSeconds * MS_PER_SECOND,
    onError: (name) => {
      console.warn(`${name}: failed, will retry next interval`)
    },
  })
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
