import {
  changeableOf,
  envOf,
  valuesFrom,
  type Bounds,
  type ChangeableKey,
  type Specs,
  type ValuesOf,
} from './setting-specs.js'

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
  moderationPollSeconds: {
    env: 'MODERATION_POLL_SECONDS',
    default: 30,
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
  // reports.comment (src/db/schema.ts).
  reportCommentMaxChars: { fixed: 500 },
  // moderation_actions.note, the reason a host gives for a ban (R-MOD-9).
  banNoteMaxChars: { fixed: 500 },
  // How many reports one member may make a day, so reporting cannot be
  // turned on someone (R-MOD-4).
  reportsPerDay: {
    env: 'REPORTS_PER_DAY',
    default: 20,
    changeable: { min: 1, max: 1000 },
  },
  // How many different members reporting someone outlines their card on the
  // moderation screen (R-MOD-6).
  reportersToFlag: {
    env: 'REPORTERS_TO_FLAG',
    default: 3,
    changeable: { min: 1, max: 100 },
  },
  // Hosts open the network replay to members; off until they do (R-NET-6).
  networkReplay: {
    env: 'NETWORK_REPLAY',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
  },
  // Below this many connections a member's own lines stay out of the
  // replay: with fewer, they could name the dots at the ends (R-NET-13).
  networkMinOwnConnections: {
    env: 'NETWORK_MIN_OWN_CONNECTIONS',
    default: 5,
    zeroAllowed: true,
    changeable: { min: 0, max: 100 },
  },
  // Hosts open each member's summit recap when the summit ends (R-RECAP-1).
  recap: {
    env: 'RECAP',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
  },
  // How long each story of the recap stays before moving on (R-RECAP-1).
  recapStorySeconds: {
    env: 'RECAP_STORY_SECONDS',
    default: 6,
    changeable: { min: 2, max: 30 },
  },
  // Comparisons round down to this many percent (R-RECAP-3).
  recapPercentStep: { env: 'RECAP_PERCENT_STEP', default: 5 },
  // Below this many active members no comparison is made: it could point at
  // someone (R-RECAP-3).
  recapMinMembers: {
    env: 'RECAP_MIN_MEMBERS',
    default: 20,
    changeable: { min: 2, max: 100_000 },
  },
  // Reports name who made them, so handled ones go after this (R-MOD-11).
  reportRetentionDays: { env: 'REPORT_RETENTION_DAYS', default: 180 },
  // The largest SVG logo an event badge takes, kept well inside the 64 kB a
  // request body may be once it is JSON (R-BADGE-5).
  badgeLogoMaxBytes: { env: 'BADGE_LOGO_MAX_BYTES', default: 32_768 },
  // event_badges.name, ticket_line and big_line (src/db/schema.ts).
  eventBadgeNameMaxChars: { fixed: 60 },
  eventBadgeTicketMaxChars: { fixed: 10 },
  eventBadgeBigMaxChars: { fixed: 6 },
} as const satisfies Specs

type LimitSpecs = typeof limitSpecs

/** The name of each limit the server enforces and the client reads. */
export type LimitKey = keyof LimitSpecs

/** The limits the server enforces and the client is told (R-CFG-2). */
export type Limits = ValuesOf<LimitSpecs>

/** A limit hosts may change in the app (R-CFG-6). */
export type ChangeableLimitKey = ChangeableKey<LimitSpecs>

/** The environment variables that set the tunable limits (R-CFG-1). */
export const limitsEnv = envOf(limitSpecs)

/** The limits as a deployment's parsed environment sets them. */
export const limitsFrom = (
  env: Parameters<typeof valuesFrom<LimitSpecs>>[1],
): Limits => valuesFrom(limitSpecs, env)

/** The bounds of each limit hosts may change (ADR 0031). */
export const changeableLimits: Readonly<Record<ChangeableLimitKey, Bounds>> =
  changeableOf(limitSpecs)
