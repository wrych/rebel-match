import { join } from 'node:path'
import { z } from 'zod'
import { rolePermissions } from './access.js'
import { latestAnalyticsVersion } from './analytics-consent.js'
import { consentWordsOf, latestConsentVersion } from './consent.js'
import type { DatabaseTarget } from './db/connect.js'
import { gameDefaults, type GameSettings } from './game/tuning.js'

// Node clamps a timer delay above 2^31-1 ms (about 24.8 days) to 1 ms, so a
// longer purge interval would run the purge continuously.
const MAX_TIMER_HOURS = Math.floor(0x7fffffff / 3_600_000)
const MAX_TIMER_SECONDS = Math.floor(0x7fffffff / 1000)

// The widths of members.name and requested_name, job_title, org and
// requested_org (src/db/schema.ts): a fact of the schema rather
// than a tunable, so no environment variable.
const NAME_MAX_CHARS = 120
const JOB_TITLE_MAX_CHARS = 120
const ORG_MAX_CHARS = 160
// members.email and outbox.to_email (src/db/schema.ts): RFC 5321's 320.
const EMAIL_MAX_CHARS = 320
// invites.label, and a cap on invites.max_uses (src/db/schema.ts).
const INVITE_LABEL_MAX_CHARS = 120
/** How long a "Saved" tick stays beside a setting (R-PROF-1). */
const SAVED_TICK_MS = 2500
/** How long a member card is held to start selecting (R-MEM-3). */
const HOLD_TO_SELECT_MS = 500
/** How far a finger travels across a deck card to browse (R-OFF-1). */
const SWIPE_MIN_PX = 50
/** How many entries each matches section shows before the rest are asked
 * for (R-ASK-15). */
const MATCHES_SHOWN_FIRST = 1
/** The share of the visible height one tap on the privacy step's scroll hint
 * moves the summary, so it never jumps to the end (R-ONB-10). */
const SCROLL_HINT_SHARE = 0.4
const INVITE_MAX_USES_CEILING = 0xffffffff
// connection_requests.message (src/db/schema.ts).
const CONNECTION_MESSAGE_MAX_CHARS = 600

function portOf(url: URL): number {
  if (url.port !== '') return Number(url.port)
  return url.protocol === 'https:' ? 443 : 80
}

function linksMissTheApp(env: {
  NODE_ENV: string
  PUBLIC_URL: string
  PORT: number
  CLIENT_DIR?: string | undefined
}): boolean {
  return (
    env.NODE_ENV === 'development' &&
    env.CLIENT_DIR === undefined &&
    portOf(new URL(env.PUBLIC_URL)) === env.PORT
  )
}

/** Where a local run keeps its PGlite database and generated session secret
 * unless LOCAL_DATA_DIR says otherwise (ADR 0024). */
export const DEFAULT_LOCAL_DATA_DIR = '.data'

// How long a browser may keep a built asset: a year. Vite names each asset
// after its content hash, so a change is a new URL; a fact of the build rather
// than a tunable, so no environment variable.
export const IMMUTABLE_ASSET_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

const FEEDBACK_NOWHERE = 'feedback@rebel-match.invalid'

/** What production refuses to start without, each with why. */
const productionRules: {
  path: string
  broken: (env: {
    DATABASE_URL?: string | undefined
    FEEDBACK_TO: string
    PUBLIC_URL: string
    TRUST_PROXY: number
    MAIL_DELIVERY: string
  }) => boolean
  message: string
}[] = [
  {
    path: 'DATABASE_URL',
    broken: (env) => env.DATABASE_URL === undefined,
    message:
      'production needs DATABASE_URL: it never falls back to a local ' +
      'PGlite folder (ADR 0024)',
  },
  {
    path: 'FEEDBACK_TO',
    broken: (env) => env.FEEDBACK_TO === FEEDBACK_NOWHERE,
    message: 'production needs FEEDBACK_TO, or feedback reaches nobody',
  },
  {
    path: 'PUBLIC_URL',
    broken: (env) => !env.PUBLIC_URL.startsWith('https:'),
    message:
      'production needs an https PUBLIC_URL, or the session cookie is ' +
      'sent without Secure (ADR 0034)',
  },
  {
    path: 'TRUST_PROXY',
    broken: (env) => env.TRUST_PROXY < 1,
    message:
      'production needs TRUST_PROXY of at least 1, or every visitor ' +
      "shares the proxy's per-IP limits (ADR 0034)",
  },
  {
    path: 'MAIL_DELIVERY',
    broken: (env) => env.MAIL_DELIVERY === 'none',
    message:
      'production must deliver over SMTP: recording magic links ' +
      'without sending them means nobody can log in (R-DEV-5)',
  },
]

// Where a commit of this repository is shown, and how much of its hash names
// it to a person (R-NFR-11).
const COMMIT_URL_BASE = 'https://github.com/wrych/rebel-match/commit/'
const SHORT_COMMIT_CHARS = 7

function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: name })
    return true
  } catch {
    return false
  }
}

function tickSettingsMissing(env: {
  SCHEDULED_WORK: string
  TICK_INVOKER?: string | undefined
  TICK_AUDIENCE?: string | undefined
}): ('TICK_INVOKER' | 'TICK_AUDIENCE')[] {
  if (env.SCHEDULED_WORK !== 'tick') return []
  return (['TICK_INVOKER', 'TICK_AUDIENCE'] as const).filter(
    (path) => env[path] === undefined,
  )
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    PUBLIC_URL: z.url().default('http://localhost:5173'),
    // The built client (`npm run build` puts it in dist/client). Set, the
    // server serves the screens itself, as a deployment does; unset, Vite
    // serves them in development (ADR 0017, ADR 0025).
    CLIENT_DIR: z
      .string()
      .optional()
      .transform((dir) => (dir === '' ? undefined : dir)),
    // The commit the image was built from, set by CI at build time; absent
    // or empty on a developer's machine (R-NFR-11).
    GIT_COMMIT: z
      .string()
      .optional()
      .transform((commit) => (commit === '' ? undefined : commit))
      .pipe(
        z
          .string()
          .regex(/^[0-9a-f]{7,40}$/)
          .optional(),
      ),

    // Unset or empty means a local run on PGlite in LOCAL_DATA_DIR (ADR 0024).
    DATABASE_URL: z
      .string()
      .optional()
      .transform((url) => (url === '' ? undefined : url)),
    LOCAL_DATA_DIR: z.string().min(1).default(DEFAULT_LOCAL_DATA_DIR),
    SESSION_SECRET: z.string().min(32),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

    MAIL_DELIVERY: z.enum(['smtp', 'none']).default('none'),
    MAIL_FROM: z.email().default('hello@rebel-match.invalid'),
    // Where members' feedback goes (R-FB-1). The default reaches nobody, so
    // production must name a real inbox.
    FEEDBACK_TO: z.email().default(FEEDBACK_NOWHERE),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),

    SEED_PROFILE: z.enum(['dev', 'prod']).default('dev'),
    SEED_ADMINS: z
      .string()
      .default('')
      .transform((list) =>
        list
          .split(',')
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email !== ''),
      )
      .pipe(z.array(z.email())),

    CONSENT_VERSION: z
      .string()
      .min(1)
      .default(latestConsentVersion)
      .refine((version) => consentWordsOf(version).length > 0, {
        message:
          'CONSENT_VERSION has no wording in src/consent.ts; members cannot accept words they cannot read',
      }),

    MIXPANEL_TOKEN: z.string().optional(),
    MIXPANEL_API_HOST: z.string().min(1).default('api-eu.mixpanel.com'),

    CHALLENGE_MIN_CHARS: z.coerce.number().int().positive().default(31),
    // What a peer still reads on one phone screen (R-ASK-3).
    CHALLENGE_MAX_CHARS: z.coerce.number().int().positive().default(500),
    BEEN_THERE_NOTE_MIN_CHARS: z.coerce.number().int().positive().default(31),
    OUTBOX_PAGE_SIZE: z.coerce.number().int().positive().default(100),
    DECK_PAGE_SIZE: z.coerce.number().int().positive().default(20),
    NEWEST_CHALLENGES_SHOWN: z.coerce.number().int().positive().default(3),
    MATCHES_POLL_SECONDS: z.coerce.number().int().positive().default(30),
    NOTIFICATIONS_PAGE_SIZE: z.coerce.number().int().positive().default(50),
    WHITELIST_BATCH_MAX: z.coerce.number().int().positive().default(1000),
    OUTBOX_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    // Notifications are kept a while for the list, then go (R-NOTE-11).
    NOTIFICATION_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
    // How long a deleted account waits before it is erased (ADR 0032).
    ERASURE_GRACE_DAYS: z.coerce.number().int().positive().default(30),
    OUTBOX_PURGE_INTERVAL_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_TIMER_HOURS)
      .default(1),
    // How often the server erases the deleted accounts that are due (ADR 0032).
    ERASURE_SWEEP_INTERVAL_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_TIMER_HOURS)
      .default(1),
    // How often expired sessions and sign-in tokens are deleted (ADR 0034).
    TOKEN_PURGE_INTERVAL_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_TIMER_HOURS)
      .default(1),
    // Who runs the scheduled work: the server's own timers, or a tick a
    // scheduler sends, signed by TICK_INVOKER for TICK_AUDIENCE (ADR 0049).
    SCHEDULED_WORK: z.enum(['timers', 'tick']).default('timers'),
    TICK_INVOKER: z.email().optional(),
    TICK_AUDIENCE: z.url().optional(),
    MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    APPROVAL_LINK_TTL_HOURS: z.coerce.number().int().positive().default(24),
    INVITE_DEFAULT_MAX_USES: z.coerce.number().int().positive().default(400),
    INVITE_DEFAULT_HOURS: z.coerce.number().int().positive().default(12),

    // Abuse limits on sign-in (R-NFR-8, ADR 0029).
    LINK_EMAILS_BEFORE_CHECK: z.coerce.number().int().nonnegative().default(3),
    LINK_EMAILS_CEILING: z.coerce.number().int().positive().default(10),
    LINK_EMAIL_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
    AUTH_REQUESTS_PER_IP: z.coerce.number().int().positive().default(1000),
    IP_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
    APPLICANTS_BEFORE_CHECK: z.coerce.number().int().nonnegative().default(30),
    APPLICANTS_CEILING: z.coerce.number().int().positive().default(300),
    APPLICANT_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
    HUMAN_CHECK_COST: z.coerce.number().int().positive().default(1000),
    HUMAN_CHECK_MINUTES: z.coerce.number().int().positive().default(5),
    // Proxy hops in front of the server whose X-Forwarded-For is believed;
    // 0 uses the socket address, Cloud Run needs 1.
    TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
    // How often a server re-reads the values hosts changed in the app
    // (ADR 0031); the server that saved a change applies it at once.
    SETTINGS_REFRESH_SECONDS: z.coerce.number().int().positive().default(60),
    // Game days one member may record per minute, and how long a day's
    // record may run: this many day lengths plus these seconds (R-GAME-20).
    GAME_RECORDS_PER_MINUTE: z.coerce.number().int().positive().default(10),
    // The top of the leaderboard players see (R-GAME-13).
    GAME_LEADERBOARD_SIZE: z.coerce.number().int().positive().default(100),
    GAME_DAY_ALLOWANCE_FACTOR: z.coerce.number().int().positive().default(2),
    GAME_DAY_ALLOWANCE_SECONDS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(60),
    // The notification worker's round, and how often a refused mail is tried
    // before it counts as failed (R-NOTE-7, R-NOTE-10).
    NOTIFICATION_WORKER_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_TIMER_SECONDS)
      .default(60),
    NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    // A refused mail waits this long before its first retry, twice as long
    // before each next; a claimed notification is held this long for the
    // server that claimed it, longer than any send takes; and one round
    // claims at most a batch (R-NOTE-10).
    NOTIFICATION_FIRST_RETRY_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    NOTIFICATION_HOLD_SECONDS: z.coerce.number().int().positive().default(300),
    NOTIFICATION_BATCH: z.coerce.number().int().positive().default(100),
    // When the daily notification mail goes out, a local time in one time
    // zone: members' own zones are not known (R-NOTE-7).
    NOTIFICATION_DAILY_AT: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default('08:00'),
    NOTIFICATION_TIME_ZONE: z
      .string()
      .refine(isTimeZone, 'not a time zone')
      .default('Europe/Zurich'),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_DELIVERY === 'smtp' && env.SMTP_HOST === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when MAIL_DELIVERY=smtp',
      })
    }
    for (const path of tickSettingsMissing(env)) {
      ctx.addIssue({
        code: 'custom',
        path: [path],
        message: `${path} is required when SCHEDULED_WORK=tick`,
      })
    }
    if (env.NODE_ENV === 'production') {
      for (const rule of productionRules) {
        if (rule.broken(env))
          ctx.addIssue({
            code: 'custom',
            path: [rule.path],
            message: rule.message,
          })
      }
    }
    if (env.CHALLENGE_MAX_CHARS < env.CHALLENGE_MIN_CHARS) {
      ctx.addIssue({
        code: 'custom',
        path: ['CHALLENGE_MAX_CHARS'],
        message:
          'CHALLENGE_MAX_CHARS is below CHALLENGE_MIN_CHARS; no challenge could be posted',
      })
    }
    if (linksMissTheApp(env)) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_URL'],
        message:
          `PUBLIC_URL points at the API server (port ${String(env.PORT)}); ` +
          'in development links must go through Vite, which serves the ' +
          'screens: use http://localhost:5173, or set CLIENT_DIR to serve ' +
          'the built client from this server',
      })
    }
  })

export type Env = z.infer<typeof envSchema>

export interface Limits {
  challengeMinChars: number
  challengeMaxChars: number
  beenThereNoteMinChars: number
  magicLinkTtlMinutes: number
  approvalLinkTtlHours: number
  inviteDefaultMaxUses: number
  inviteDefaultHours: number
  outboxRetentionDays: number
  notificationRetentionDays: number
  erasureGraceDays: number
  outboxPageSize: number
  deckPageSize: number
  newestChallengesShown: number
  matchesPollSeconds: number
  notificationsPageSize: number
  whitelistBatchMax: number
  emailMaxChars: number
  nameMaxChars: number
  jobTitleMaxChars: number
  orgMaxChars: number
  inviteLabelMaxChars: number
  savedTickMs: number
  holdToSelectMs: number
  swipeMinPx: number
  matchesShownFirst: number
  scrollHintShare: number
  inviteMaxUsesCeiling: number
  connectionMessageMaxChars: number
}

/** The sign-in abuse limits (R-NFR-8, ADR 0029). Kept out of `Limits`, so
 * `GET /api/config` never tells a script how far it can go. */
export interface AbuseLimits {
  linkEmailsBeforeCheck: number
  linkEmailsCeiling: number
  linkEmailWindowMinutes: number
  authRequestsPerIp: number
  ipWindowMinutes: number
  applicantsBeforeCheck: number
  applicantsCeiling: number
  applicantWindowMinutes: number
  /** PBKDF2 iterations per try of the human check's proof of work. */
  humanCheckCost: number
  /** How long a human-check challenge can be solved and sent back. */
  humanCheckMinutes: number
}

/** The values hosts may change while the server runs (ADR 0031). Read when
 * used, never kept from startup, so a change applies without a restart. */
export interface LiveSettings {
  limits(): Limits
  abuse(): AbuseLimits
  game(): GameSettings
}

/** The deployment's values, never changed: settings as loaded at startup. */
export function fixedSettings(config: Config): LiveSettings {
  return {
    limits: () => config.limits,
    abuse: () => config.abuse,
    game: () => config.game,
  }
}

/** The running version as the menu shows it: the short commit and a link to
 * it, or `dev` and none for a build without a commit (R-NFR-11). */
export interface BuildVersion {
  commit: string
  url: string | null
}

/** Values the client is allowed to read, so a disabled button and a server
 * check can never disagree (R-CFG-2). Secrets are structurally absent. */
export interface ClientConfig {
  limits: Limits
  consentVersion: string
  analyticsVersion: string
  feedbackTo: string
  build: BuildVersion
}

export type ScheduledWork =
  { mode: 'timers' } | { mode: 'tick'; invoker: string; audience: string }

export interface Config {
  env: Env['NODE_ENV']
  isProduction: boolean
  port: number
  publicUrl: string
  /** Where the built client is served from; absent when Vite serves it. */
  clientDir?: string
  database: DatabaseTarget
  sessionSecret: string
  sessionTtlDays: number
  outboxPurgeIntervalHours: number
  erasureSweepIntervalHours: number
  tokenPurgeIntervalHours: number
  settingsRefreshSeconds: number
  /** Who runs the scheduled work, and whose tick is believed (ADR 0049). */
  scheduledWork: ScheduledWork
  /** The notification worker's round and retries (R-NOTE-7, R-NOTE-10). */
  notificationWorker: NotificationWorkerSettings
  mail: {
    delivery: Env['MAIL_DELIVERY']
    from: string
    smtp: { host?: string; port: number; user?: string; password?: string }
  }
  feedbackTo: string
  seedProfile: Env['SEED_PROFILE']
  /** Addresses the prod seed makes admins (R-SEED-9). */
  seedAdmins: string[]
  consentVersion: string
  /** The analytics opt-in words in force (R-ANA-4); new words ship as code. */
  analyticsVersion: string
  analytics: { token?: string; apiHost: string }
  limits: Limits
  abuse: AbuseLimits
  /** The game's tuning; its values are set in the app, never the environment
   * (R-GAME-17). */
  game: GameSettings
  /** Game days one member may record per minute (R-GAME-20). */
  gameRecordsPerMinute: number
  /** How many bests the leaderboard shows above the caller's (R-GAME-13). */
  gameLeaderboardSize: number
  /** How long a day's record may run: day lengths plus seconds (R-GAME-20). */
  gameDayAllowance: { factor: number; extraSeconds: number }
  trustProxy: number
  rolePermissions: typeof rolePermissions
  /** The commit the build was made from, if it was made from one (R-NFR-11). */
  build: { commit?: string; commitUrlBase: string }
}

function limitsFrom(env: Env): Limits {
  return {
    challengeMinChars: env.CHALLENGE_MIN_CHARS,
    challengeMaxChars: env.CHALLENGE_MAX_CHARS,
    beenThereNoteMinChars: env.BEEN_THERE_NOTE_MIN_CHARS,
    magicLinkTtlMinutes: env.MAGIC_LINK_TTL_MINUTES,
    approvalLinkTtlHours: env.APPROVAL_LINK_TTL_HOURS,
    inviteDefaultMaxUses: env.INVITE_DEFAULT_MAX_USES,
    inviteDefaultHours: env.INVITE_DEFAULT_HOURS,
    outboxRetentionDays: env.OUTBOX_RETENTION_DAYS,
    notificationRetentionDays: env.NOTIFICATION_RETENTION_DAYS,
    erasureGraceDays: env.ERASURE_GRACE_DAYS,
    outboxPageSize: env.OUTBOX_PAGE_SIZE,
    deckPageSize: env.DECK_PAGE_SIZE,
    newestChallengesShown: env.NEWEST_CHALLENGES_SHOWN,
    matchesPollSeconds: env.MATCHES_POLL_SECONDS,
    notificationsPageSize: env.NOTIFICATIONS_PAGE_SIZE,
    whitelistBatchMax: env.WHITELIST_BATCH_MAX,
    emailMaxChars: EMAIL_MAX_CHARS,
    nameMaxChars: NAME_MAX_CHARS,
    jobTitleMaxChars: JOB_TITLE_MAX_CHARS,
    orgMaxChars: ORG_MAX_CHARS,
    inviteLabelMaxChars: INVITE_LABEL_MAX_CHARS,
    savedTickMs: SAVED_TICK_MS,
    holdToSelectMs: HOLD_TO_SELECT_MS,
    swipeMinPx: SWIPE_MIN_PX,
    matchesShownFirst: MATCHES_SHOWN_FIRST,
    scrollHintShare: SCROLL_HINT_SHARE,
    inviteMaxUsesCeiling: INVITE_MAX_USES_CEILING,
    connectionMessageMaxChars: CONNECTION_MESSAGE_MAX_CHARS,
  }
}

function abuseLimitsFrom(env: Env): AbuseLimits {
  return {
    linkEmailsBeforeCheck: env.LINK_EMAILS_BEFORE_CHECK,
    linkEmailsCeiling: env.LINK_EMAILS_CEILING,
    linkEmailWindowMinutes: env.LINK_EMAIL_WINDOW_MINUTES,
    authRequestsPerIp: env.AUTH_REQUESTS_PER_IP,
    ipWindowMinutes: env.IP_WINDOW_MINUTES,
    applicantsBeforeCheck: env.APPLICANTS_BEFORE_CHECK,
    applicantsCeiling: env.APPLICANTS_CEILING,
    applicantWindowMinutes: env.APPLICANT_WINDOW_MINUTES,
    humanCheckCost: env.HUMAN_CHECK_COST,
    humanCheckMinutes: env.HUMAN_CHECK_MINUTES,
  }
}

export interface NotificationWorkerSettings {
  intervalSeconds: number
  maxAttempts: number
  firstRetrySeconds: number
  holdSeconds: number
  batch: number
  dailyAt: string
  timeZone: string
}

function notificationWorkerFrom(env: Env): NotificationWorkerSettings {
  return {
    intervalSeconds: env.NOTIFICATION_WORKER_SECONDS,
    maxAttempts: env.NOTIFICATION_MAX_ATTEMPTS,
    firstRetrySeconds: env.NOTIFICATION_FIRST_RETRY_SECONDS,
    holdSeconds: env.NOTIFICATION_HOLD_SECONDS,
    batch: env.NOTIFICATION_BATCH,
    dailyAt: env.NOTIFICATION_DAILY_AT,
    timeZone: env.NOTIFICATION_TIME_ZONE,
  }
}

function mailFrom(env: Env): Config['mail'] {
  return {
    delivery: env.MAIL_DELIVERY,
    from: env.MAIL_FROM,
    smtp: {
      ...(env.SMTP_HOST === undefined ? {} : { host: env.SMTP_HOST }),
      port: env.SMTP_PORT,
      ...(env.SMTP_USER === undefined ? {} : { user: env.SMTP_USER }),
      ...(env.SMTP_PASSWORD === undefined
        ? {}
        : { password: env.SMTP_PASSWORD }),
    },
  }
}

function scheduledWorkFrom(env: Env): ScheduledWork {
  if (
    env.SCHEDULED_WORK === 'timers' ||
    env.TICK_INVOKER === undefined ||
    env.TICK_AUDIENCE === undefined
  )
    return { mode: 'timers' }
  return {
    mode: 'tick',
    invoker: env.TICK_INVOKER,
    audience: env.TICK_AUDIENCE,
  }
}

/** Reads and validates configuration, failing before the server accepts a
 * request rather than on the first use of a bad value (R-CFG-1, R-CFG-4). */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const env = envSchema.parse(source)

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    publicUrl: env.PUBLIC_URL,
    ...(env.CLIENT_DIR === undefined ? {} : { clientDir: env.CLIENT_DIR }),
    database:
      env.DATABASE_URL === undefined
        ? { kind: 'pglite', dataDir: join(env.LOCAL_DATA_DIR, 'pglite') }
        : { kind: 'postgres', url: env.DATABASE_URL },
    sessionSecret: env.SESSION_SECRET,
    sessionTtlDays: env.SESSION_TTL_DAYS,
    outboxPurgeIntervalHours: env.OUTBOX_PURGE_INTERVAL_HOURS,
    erasureSweepIntervalHours: env.ERASURE_SWEEP_INTERVAL_HOURS,
    tokenPurgeIntervalHours: env.TOKEN_PURGE_INTERVAL_HOURS,
    settingsRefreshSeconds: env.SETTINGS_REFRESH_SECONDS,
    scheduledWork: scheduledWorkFrom(env),
    notificationWorker: notificationWorkerFrom(env),
    mail: mailFrom(env),
    feedbackTo: env.FEEDBACK_TO,
    seedProfile: env.SEED_PROFILE,
    seedAdmins: env.SEED_ADMINS,
    consentVersion: env.CONSENT_VERSION,
    analyticsVersion: latestAnalyticsVersion,
    analytics: {
      ...(env.MIXPANEL_TOKEN === undefined
        ? {}
        : { token: env.MIXPANEL_TOKEN }),
      apiHost: env.MIXPANEL_API_HOST,
    },
    limits: limitsFrom(env),
    abuse: abuseLimitsFrom(env),
    game: gameDefaults,
    gameRecordsPerMinute: env.GAME_RECORDS_PER_MINUTE,
    gameLeaderboardSize: env.GAME_LEADERBOARD_SIZE,
    gameDayAllowance: {
      factor: env.GAME_DAY_ALLOWANCE_FACTOR,
      extraSeconds: env.GAME_DAY_ALLOWANCE_SECONDS,
    },
    trustProxy: env.TRUST_PROXY,
    rolePermissions,
    build: {
      ...(env.GIT_COMMIT === undefined ? {} : { commit: env.GIT_COMMIT }),
      commitUrlBase: COMMIT_URL_BASE,
    },
  }
}

/** The menu's version line: the short commit linked to the full one, or
 * `dev` (R-NFR-11). */
export function buildVersion(build: Config['build']): BuildVersion {
  return build.commit === undefined
    ? { commit: 'dev', url: null }
    : {
        commit: build.commit.slice(0, SHORT_COMMIT_CHARS),
        url: build.commitUrlBase + build.commit,
      }
}

/** The configuration with nothing set but a placeholder secret: what each
 * value would be by default, for the host tools to compare with (R-CFG-5). */
export function defaultConfig(): Config {
  return loadConfig({ SESSION_SECRET: '0'.repeat(32) })
}

/** The subset served by `GET /api/config`. Built by naming what goes in, so a
 * new secret cannot reach the client by being added to Config (R-CFG-2). */
export function clientConfig(config: Config, limits: Limits): ClientConfig {
  return {
    limits,
    consentVersion: config.consentVersion,
    analyticsVersion: config.analyticsVersion,
    feedbackTo: config.feedbackTo,
    build: buildVersion(config.build),
  }
}

/** A development deployment: NODE_ENV=development with delivery off, so mail
 * cannot leave the server and it holds only fictional people, wherever it
 * runs. The only place the outbound log may keep a usable link (R-DEV-1,
 * R-MSG-4, requirements §8c). */
export function isDevelopmentDeployment(config: {
  env: Config['env']
  mail: Pick<Config['mail'], 'delivery'>
}): boolean {
  return config.env === 'development' && config.mail.delivery === 'none'
}
