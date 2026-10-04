import { join } from 'node:path'
import { z } from 'zod'
import { rolePermissions } from './access.js'
import { consentWordsOf, latestConsentVersion } from './consent.js'
import type { DatabaseTarget } from './db/connect.js'

// Node clamps a timer delay above 2^31-1 ms (about 24.8 days) to 1 ms, so a
// longer purge interval would run the purge continuously.
const MAX_TIMER_HOURS = Math.floor(0x7fffffff / 3_600_000)

// The widths of members.name and requested_name, job_title, org and
// requested_org, and sector (src/db/schema.ts): a fact of the schema rather
// than a tunable, so no environment variable.
const NAME_MAX_CHARS = 120
const JOB_TITLE_MAX_CHARS = 120
const ORG_MAX_CHARS = 160
const SECTOR_MAX_CHARS = 160
// invites.label, and a cap on invites.max_uses (src/db/schema.ts).
const INVITE_LABEL_MAX_CHARS = 120
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
}): boolean {
  return (
    env.NODE_ENV === 'development' &&
    portOf(new URL(env.PUBLIC_URL)) === env.PORT
  )
}

/** Where a local run keeps its PGlite database and generated session secret
 * unless LOCAL_DATA_DIR says otherwise (ADR 0024). */
export const DEFAULT_LOCAL_DATA_DIR = '.data'

const FEEDBACK_NOWHERE = 'feedback@rebel-match.invalid'

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    PUBLIC_URL: z.url().default('http://localhost:5173'),

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
    BEEN_THERE_NOTE_MIN_CHARS: z.coerce.number().int().positive().default(31),
    OUTBOX_PAGE_SIZE: z.coerce.number().int().positive().default(100),
    DECK_PAGE_SIZE: z.coerce.number().int().positive().default(20),
    WHITELIST_BATCH_MAX: z.coerce.number().int().positive().default(1000),
    OUTBOX_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    OUTBOX_PURGE_INTERVAL_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_TIMER_HOURS)
      .default(1),
    MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    APPROVAL_LINK_TTL_HOURS: z.coerce.number().int().positive().default(24),
    INVITE_DEFAULT_MAX_USES: z.coerce.number().int().positive().default(400),
    INVITE_DEFAULT_HOURS: z.coerce.number().int().positive().default(12),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_DELIVERY === 'smtp' && env.SMTP_HOST === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when MAIL_DELIVERY=smtp',
      })
    }
    if (env.NODE_ENV === 'production' && env.DATABASE_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message:
          'production needs DATABASE_URL: it never falls back to a local ' +
          'PGlite folder (ADR 0024)',
      })
    }
    if (env.NODE_ENV === 'production' && env.FEEDBACK_TO === FEEDBACK_NOWHERE) {
      ctx.addIssue({
        code: 'custom',
        path: ['FEEDBACK_TO'],
        message: 'production needs FEEDBACK_TO, or feedback reaches nobody',
      })
    }
    if (env.NODE_ENV === 'production' && env.MAIL_DELIVERY === 'none') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_DELIVERY'],
        message:
          'production must deliver over SMTP: recording magic links ' +
          'without sending them means nobody can log in (R-DEV-5)',
      })
    }
    if (linksMissTheApp(env)) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_URL'],
        message:
          `PUBLIC_URL points at the API server (port ${String(env.PORT)}); ` +
          'in development links must go through Vite, which serves the ' +
          'screens: use http://localhost:5173',
      })
    }
  })

export type Env = z.infer<typeof envSchema>

export interface Limits {
  challengeMinChars: number
  beenThereNoteMinChars: number
  magicLinkTtlMinutes: number
  approvalLinkTtlHours: number
  inviteDefaultMaxUses: number
  inviteDefaultHours: number
  outboxRetentionDays: number
  outboxPageSize: number
  deckPageSize: number
  whitelistBatchMax: number
  nameMaxChars: number
  jobTitleMaxChars: number
  orgMaxChars: number
  sectorMaxChars: number
  inviteLabelMaxChars: number
  inviteMaxUsesCeiling: number
  connectionMessageMaxChars: number
}

/** Values the client is allowed to read, so a disabled button and a server
 * check can never disagree (R-CFG-2). Secrets are structurally absent. */
export interface ClientConfig {
  limits: Limits
  consentVersion: string
  feedbackTo: string
}

export interface Config {
  env: Env['NODE_ENV']
  isProduction: boolean
  port: number
  publicUrl: string
  database: DatabaseTarget
  sessionSecret: string
  sessionTtlDays: number
  outboxPurgeIntervalHours: number
  mail: {
    delivery: Env['MAIL_DELIVERY']
    from: string
    smtp: { host?: string; port: number; user?: string; password?: string }
  }
  feedbackTo: string
  seedProfile: Env['SEED_PROFILE']
  consentVersion: string
  analytics: { token?: string; apiHost: string }
  limits: Limits
  rolePermissions: typeof rolePermissions
}

function limitsFrom(env: Env): Limits {
  return {
    challengeMinChars: env.CHALLENGE_MIN_CHARS,
    beenThereNoteMinChars: env.BEEN_THERE_NOTE_MIN_CHARS,
    magicLinkTtlMinutes: env.MAGIC_LINK_TTL_MINUTES,
    approvalLinkTtlHours: env.APPROVAL_LINK_TTL_HOURS,
    inviteDefaultMaxUses: env.INVITE_DEFAULT_MAX_USES,
    inviteDefaultHours: env.INVITE_DEFAULT_HOURS,
    outboxRetentionDays: env.OUTBOX_RETENTION_DAYS,
    outboxPageSize: env.OUTBOX_PAGE_SIZE,
    deckPageSize: env.DECK_PAGE_SIZE,
    whitelistBatchMax: env.WHITELIST_BATCH_MAX,
    nameMaxChars: NAME_MAX_CHARS,
    jobTitleMaxChars: JOB_TITLE_MAX_CHARS,
    orgMaxChars: ORG_MAX_CHARS,
    sectorMaxChars: SECTOR_MAX_CHARS,
    inviteLabelMaxChars: INVITE_LABEL_MAX_CHARS,
    inviteMaxUsesCeiling: INVITE_MAX_USES_CEILING,
    connectionMessageMaxChars: CONNECTION_MESSAGE_MAX_CHARS,
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
    database:
      env.DATABASE_URL === undefined
        ? { kind: 'pglite', dataDir: join(env.LOCAL_DATA_DIR, 'pglite') }
        : { kind: 'postgres', url: env.DATABASE_URL },
    sessionSecret: env.SESSION_SECRET,
    sessionTtlDays: env.SESSION_TTL_DAYS,
    outboxPurgeIntervalHours: env.OUTBOX_PURGE_INTERVAL_HOURS,
    mail: {
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
    },
    feedbackTo: env.FEEDBACK_TO,
    seedProfile: env.SEED_PROFILE,
    consentVersion: env.CONSENT_VERSION,
    analytics: {
      ...(env.MIXPANEL_TOKEN === undefined
        ? {}
        : { token: env.MIXPANEL_TOKEN }),
      apiHost: env.MIXPANEL_API_HOST,
    },
    limits: limitsFrom(env),
    rolePermissions,
  }
}

/** The subset served by `GET /api/config`. Built by naming what goes in, so a
 * new secret cannot reach the client by being added to Config (R-CFG-2). */
export function clientConfig(config: Config): ClientConfig {
  return {
    limits: config.limits,
    consentVersion: config.consentVersion,
    feedbackTo: config.feedbackTo,
  }
}

/** A development deployment: NODE_ENV=development with delivery off, so mail
 * cannot leave the machine. The only place the outbound log may keep a usable
 * link (R-DEV-1, R-MSG-4). */
export function isDevelopmentDeployment(
  config: Pick<Config, 'env' | 'mail'>,
): boolean {
  return config.env === 'development' && config.mail.delivery === 'none'
}
