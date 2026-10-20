import { z } from 'zod'

/** The lowest and highest value a host may set for a changeable setting. */
export interface Bounds {
  min: number
  max: number
}

interface Tunable {
  /** The environment variable a deployment sets it with. */
  env: string
  default: number
  /** Changeable in the app, within these bounds (R-CFG-6, ADR 0031). */
  changeable?: Bounds
}

interface Fixed {
  /** Fixed in code: no deployment can change it. */
  fixed: number
}

// Often enough to feel live, never so often that open screens flood the
// server (ADR 0050).
const POLL: Bounds = { min: 2, max: 3600 }

const limitSpecs = {
  challengeMinChars: {
    env: 'CHALLENGE_MIN_CHARS',
    default: 31,
    changeable: { min: 1, max: 300 },
  },
  // What a peer still reads on one phone screen (R-ASK-3).
  challengeMaxChars: { env: 'CHALLENGE_MAX_CHARS', default: 500 },
  beenThereNoteMinChars: {
    env: 'BEEN_THERE_NOTE_MIN_CHARS',
    default: 31,
    changeable: { min: 1, max: 300 },
  },
  magicLinkTtlMinutes: { env: 'MAGIC_LINK_TTL_MINUTES', default: 15 },
  approvalLinkTtlHours: { env: 'APPROVAL_LINK_TTL_HOURS', default: 24 },
  inviteDefaultMaxUses: {
    env: 'INVITE_DEFAULT_MAX_USES',
    default: 400,
    changeable: { min: 1, max: 100_000 },
  },
  inviteDefaultHours: {
    env: 'INVITE_DEFAULT_HOURS',
    default: 12,
    changeable: { min: 1, max: 720 },
  },
  outboxRetentionDays: { env: 'OUTBOX_RETENTION_DAYS', default: 30 },
  // Notifications are kept a while for the list, then go (R-NOTE-11).
  notificationRetentionDays: {
    env: 'NOTIFICATION_RETENTION_DAYS',
    default: 90,
  },
  // How long a deleted account waits before it is erased (ADR 0032).
  erasureGraceDays: { env: 'ERASURE_GRACE_DAYS', default: 30 },
  outboxPageSize: { env: 'OUTBOX_PAGE_SIZE', default: 100 },
  deckPageSize: { env: 'DECK_PAGE_SIZE', default: 20 },
  newestChallengesShown: { env: 'NEWEST_CHALLENGES_SHOWN', default: 3 },
  // How often each live list re-reads while it is open (R-NAV-12).
  matchesPollSeconds: {
    env: 'MATCHES_POLL_SECONDS',
    default: 8,
    changeable: POLL,
  },
  cockpitPollSeconds: {
    env: 'COCKPIT_POLL_SECONDS',
    default: 8,
    changeable: POLL,
  },
  challengeMatchesPollSeconds: {
    env: 'CHALLENGE_MATCHES_POLL_SECONDS',
    default: 8,
    changeable: POLL,
  },
  notificationsPollSeconds: {
    env: 'NOTIFICATIONS_POLL_SECONDS',
    default: 8,
    changeable: POLL,
  },
  outboxPollSeconds: {
    env: 'OUTBOX_POLL_SECONDS',
    default: 8,
    changeable: POLL,
  },
  membersPollSeconds: {
    env: 'MEMBERS_POLL_SECONDS',
    default: 60,
    changeable: POLL,
  },
  applicantsPollSeconds: {
    env: 'APPLICANTS_POLL_SECONDS',
    default: 60,
    changeable: POLL,
  },
  invitesPollSeconds: {
    env: 'INVITES_POLL_SECONDS',
    default: 60,
    changeable: POLL,
  },
  leaderboardPollSeconds: {
    env: 'LEADERBOARD_POLL_SECONDS',
    default: 30,
    changeable: POLL,
  },
  notificationsPageSize: { env: 'NOTIFICATIONS_PAGE_SIZE', default: 50 },
  whitelistBatchMax: { env: 'WHITELIST_BATCH_MAX', default: 1000 },
  // members.email and outbox.to_email (src/db/schema.ts): RFC 5321's 320.
  emailMaxChars: { fixed: 320 },
  // The widths of members.name and requested_name, job_title, org and
  // requested_org (src/db/schema.ts): a fact of the schema rather than a
  // tunable, so no environment variable.
  nameMaxChars: { fixed: 120 },
  jobTitleMaxChars: { fixed: 120 },
  orgMaxChars: { fixed: 160 },
  // invites.label, and a cap on invites.max_uses (src/db/schema.ts).
  inviteLabelMaxChars: { fixed: 120 },
  // How long a "Saved" tick stays beside a setting (R-PROF-1).
  savedTickMs: { fixed: 2500 },
  // How long a member card is held to start selecting (R-MEM-3).
  holdToSelectMs: { fixed: 500 },
  // How far a finger travels across a deck card to browse (R-OFF-1).
  swipeMinPx: { fixed: 50 },
  // How far a finger pulls a live list down to refresh it (R-NAV-12).
  pullRefreshPx: { fixed: 70 },
  // How many entries each matches section shows before the rest are asked
  // for (R-ASK-15).
  matchesShownFirst: { fixed: 1 },
  // How many entries the sentence over each matches section names before it
  // counts the rest, in the summary layout (R-ASK-15).
  matchesNamedFirst: { fixed: 2 },
  // The share of the visible height one tap on the privacy step's scroll hint
  // moves the summary, so it never jumps to the end (R-ONB-10).
  scrollHintShare: { fixed: 0.4 },
  inviteMaxUsesCeiling: { fixed: 0xffffffff },
  // connection_requests.message (src/db/schema.ts).
  connectionMessageMaxChars: { fixed: 600 },
} as const satisfies Record<string, Tunable | Fixed>

type Specs = typeof limitSpecs

/** The name of each limit the server enforces and the client reads. */
export type LimitKey = keyof Specs

/** The limits the server enforces and the client is told (R-CFG-2). */
export type Limits = Record<LimitKey, number>

type TunableKey = {
  [K in LimitKey]: Specs[K] extends { env: string } ? K : never
}[LimitKey]

/** A limit hosts may change in the app (R-CFG-6). */
export type ChangeableLimitKey = {
  [K in LimitKey]: Specs[K] extends { changeable: Bounds } ? K : never
}[LimitKey]

type EnvNumber = z.ZodDefault<z.ZodCoercedNumber>

const envNumber = (fallback: number): EnvNumber =>
  z.coerce.number().int().positive().default(fallback)

type LimitsEnv = { [K in TunableKey as Specs[K]['env']]: EnvNumber }

const entries = Object.entries(limitSpecs) as [LimitKey, Tunable | Fixed][]

/** The environment variables that set the tunable limits, each a positive
 * whole number with its default (R-CFG-1). */
export const limitsEnv = Object.fromEntries(
  entries.flatMap(([, spec]) =>
    'env' in spec ? [[spec.env, envNumber(spec.default)]] : [],
  ),
) as LimitsEnv

/** The limits as a deployment's parsed environment sets them. */
export function limitsFrom(env: z.output<z.ZodObject<LimitsEnv>>): Limits {
  const values = env as Readonly<Record<string, number>>
  return Object.fromEntries(
    entries.map(([key, spec]) => [
      key,
      'fixed' in spec ? spec.fixed : (values[spec.env] ?? spec.default),
    ]),
  ) as Limits
}

/** The bounds of each limit hosts may change (ADR 0031). */
export const changeableLimits = Object.fromEntries(
  entries.flatMap(([key, spec]) =>
    'changeable' in spec ? [[key, spec.changeable]] : [],
  ),
) as Readonly<Record<ChangeableLimitKey, Bounds>>
