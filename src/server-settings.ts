import {
  DAYS,
  envOf,
  HOURS,
  MINUTES,
  SECONDS,
  shownOf,
  valuesFrom,
  type ShownKey,
  type ShownSpec,
  type Specs,
  type ValuesOf,
} from './setting-specs.js'

// Node clamps a timer delay above 2^31-1 ms (about 24.8 days) to 1 ms, so a
// longer interval would run its work continuously.
const MAX_TIMER_HOURS = Math.floor(0x7fffffff / 3_600_000)
const MAX_TIMER_SECONDS = Math.floor(0x7fffffff / 1000)
const MAX_TIMER_MINUTES = Math.floor(MAX_TIMER_SECONDS / 60)

const serverSpecs = {
  port: { env: 'PORT', default: 3000 },
  sessionTtlDays: {
    env: 'SESSION_TTL_DAYS',
    default: 30,
    shown: {
      name: 'Signed out after not using the app for',
      explanation:
        'Every use restarts the period, so an active member stays signed ' +
        'in.',
      unit: DAYS,
    },
  },
  outboxPurgeIntervalHours: {
    env: 'OUTBOX_PURGE_INTERVAL_HOURS',
    default: 1,
    max: MAX_TIMER_HOURS,
    shown: {
      name: 'Delete old log entries every',
      explanation: 'How often the server clears entries past that period.',
      unit: HOURS,
    },
  },
  // ADR 0032.
  erasureSweepIntervalHours: {
    env: 'ERASURE_SWEEP_INTERVAL_HOURS',
    default: 1,
    max: MAX_TIMER_HOURS,
    shown: {
      name: 'Erase due accounts every',
      explanation: 'How often the server erases accounts past that period.',
      unit: HOURS,
    },
  },
  // Expired sessions and sign-in tokens (ADR 0034).
  tokenPurgeIntervalHours: {
    env: 'TOKEN_PURGE_INTERVAL_HOURS',
    default: 1,
    max: MAX_TIMER_HOURS,
    shown: {
      name: 'Delete expired sign-ins every',
      explanation:
        'How often the server deletes sessions and sign-in links past ' +
        'their lifetime.',
      unit: HOURS,
    },
  },
  // How often a server re-reads the values hosts changed in the app
  // (ADR 0031); the server that saved a change applies it at once.
  settingsRefreshSeconds: { env: 'SETTINGS_REFRESH_SECONDS', default: 60 },
  // Proxy hops in front of the server whose X-Forwarded-For is believed;
  // 0 uses the socket address, Cloud Run needs 1.
  trustProxy: {
    env: 'TRUST_PROXY',
    default: 0,
    zeroAllowed: true,
    shown: {
      name: 'Trusted proxies in front of the server',
      explanation:
        'How many proxies are trusted to report the visitor’s address: 1 ' +
        'on Cloud Run, 0 when visitors reach the server directly. If it is ' +
        'wrong, every visitor can look like the same network.',
    },
  },
  // Every crown checked against counts that fell with nobody acting
  // (R-BADGE-3).
  badgeCrownCheckMinutes: {
    env: 'BADGE_CROWN_CHECK_MINUTES',
    default: 15,
    max: MAX_TIMER_MINUTES,
    shown: {
      name: 'Crowns are checked every',
      explanation:
        'Each crown also moves on its own, when a count falls because a challenge or an account was deleted.',
      unit: MINUTES,
    },
  },
  // R-GAME-20.
  gameRecordsPerMinute: {
    env: 'GAME_RECORDS_PER_MINUTE',
    default: 10,
    shown: {
      name: 'Game days one member may record per minute',
      explanation:
        'More than this from one member is refused, to slow a script ' +
        'sending scores.',
      unit: DAYS,
    },
  },
  // The bests the leaderboard shows above the caller's (R-GAME-13).
  gameLeaderboardSize: {
    env: 'GAME_LEADERBOARD_SIZE',
    default: 100,
    shown: {
      name: 'Places on the leaderboard',
      explanation:
        'How many players the leaderboard lists; a player below them sees ' +
        'their own place too.',
      unit: ['place', 'places'],
    },
  },
} as const satisfies Specs

// The notification worker's round, and how often a refused mail is tried
// before it counts as failed (R-NOTE-7, R-NOTE-10). A refused mail waits
// firstRetrySeconds before its first retry, twice as long before each next; a
// claimed notification is held for the server that claimed it, longer than any
// send takes; and one round claims at most a batch.
const notificationWorkerSpecs = {
  intervalSeconds: {
    env: 'NOTIFICATION_WORKER_SECONDS',
    default: 60,
    max: MAX_TIMER_SECONDS,
    shown: {
      name: 'Send notification emails every',
      explanation: 'How often the server mails the notifications due.',
      unit: SECONDS,
    },
  },
  maxAttempts: {
    env: 'NOTIFICATION_MAX_ATTEMPTS',
    default: 5,
    shown: {
      name: 'Tries before a notification email counts as failed',
      explanation:
        'A refused email is tried again, waiting longer each time, this many times in all.',
      unit: ['try', 'tries'],
    },
  },
  firstRetrySeconds: {
    env: 'NOTIFICATION_FIRST_RETRY_SECONDS',
    default: 60,
    shown: {
      name: 'First retry of a refused notification email after',
      explanation: 'Each retry after it waits twice as long as the one before.',
      unit: SECONDS,
    },
  },
  holdSeconds: {
    env: 'NOTIFICATION_HOLD_SECONDS',
    default: 300,
    shown: {
      name: 'A server holds the notifications it is mailing for',
      explanation:
        'Another server leaves them alone this long, so none is mailed twice.',
      unit: SECONDS,
    },
  },
  batch: {
    env: 'NOTIFICATION_BATCH',
    default: 100,
    shown: {
      name: 'Notification emails per round, at most',
      explanation: 'The rest wait for the next round.',
      unit: ['email', 'emails'],
    },
  },
} as const satisfies Specs

// How long a game day's record may run: this many day lengths plus these
// seconds (R-GAME-20).
const gameDayAllowanceSpecs = {
  factor: {
    env: 'GAME_DAY_ALLOWANCE_FACTOR',
    default: 2,
    shown: {
      name: 'A game day’s record may run up to',
      explanation:
        'Day lengths, plus the seconds below, before a record is refused ' +
        'as one no day can take. A paused day’s clock stands still.',
      unit: ['day length', 'day lengths'],
    },
  },
  extraSeconds: {
    env: 'GAME_DAY_ALLOWANCE_SECONDS',
    default: 60,
    zeroAllowed: true,
    shown: {
      name: 'Plus',
      explanation: 'Added to the day lengths above.',
      unit: SECONDS,
    },
  },
} as const satisfies Specs

const smtpSpecs = {
  port: {
    env: 'SMTP_PORT',
    default: 587,
    shown: {
      name: 'Mail server port',
      explanation: 'The port of the mail server.',
    },
  },
} as const satisfies Specs

type ServerSpecs = typeof serverSpecs
type NotificationWorkerSpecs = typeof notificationWorkerSpecs
type GameDayAllowanceSpecs = typeof gameDayAllowanceSpecs
type SmtpSpecs = typeof smtpSpecs

/** The server's own numbers: its port, sessions, timers and the game's
 * guards against scripted scores. */
export type ServerSettings = ValuesOf<ServerSpecs>

/** The notification worker's numbers (R-NOTE-7, R-NOTE-10). */
export type NotificationWorkerRounds = ValuesOf<NotificationWorkerSpecs>

/** How long a day's record may run: day lengths plus seconds (R-GAME-20). */
export type GameDayAllowance = ValuesOf<GameDayAllowanceSpecs>

/** The environment variables that set the server's numbers (R-CFG-1). */
export const serverEnv = {
  ...envOf(serverSpecs),
  ...envOf(notificationWorkerSpecs),
  ...envOf(gameDayAllowanceSpecs),
  ...envOf(smtpSpecs),
}

type ParsedEnv<S extends Specs> = Parameters<typeof valuesFrom<S>>[1]

/** The server's numbers as a deployment's parsed environment sets them. */
export const serverFrom = (env: ParsedEnv<ServerSpecs>): ServerSettings =>
  valuesFrom(serverSpecs, env)

/** The notification worker's numbers as the environment sets them. */
export const notificationRoundsFrom = (
  env: ParsedEnv<NotificationWorkerSpecs>,
): NotificationWorkerRounds => valuesFrom(notificationWorkerSpecs, env)

/** A game day's allowance as the environment sets it. */
export const gameDayAllowanceFrom = (
  env: ParsedEnv<GameDayAllowanceSpecs>,
): GameDayAllowance => valuesFrom(gameDayAllowanceSpecs, env)

/** The mail server's port as the environment sets it. */
export const smtpPortFrom = (env: ParsedEnv<SmtpSpecs>): number =>
  valuesFrom(smtpSpecs, env).port

/** How the host tools show the server's numbers (R-CFG-5). */
export const shownServer: Readonly<Record<ShownKey<ServerSpecs>, ShownSpec>> =
  shownOf(serverSpecs)

/** How the host tools show the notification worker's numbers (R-CFG-5). */
export const shownNotificationWorker: Readonly<
  Record<ShownKey<NotificationWorkerSpecs>, ShownSpec>
> = shownOf(notificationWorkerSpecs)

/** How the host tools show a game day's allowance (R-CFG-5). */
export const shownGameDayAllowance: Readonly<
  Record<ShownKey<GameDayAllowanceSpecs>, ShownSpec>
> = shownOf(gameDayAllowanceSpecs)

/** How the host tools show the mail server's port (R-CFG-5). */
export const shownSmtp: Readonly<Record<ShownKey<SmtpSpecs>, ShownSpec>> =
  shownOf(smtpSpecs)
