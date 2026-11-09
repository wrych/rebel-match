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
  // members.linkedin_url and instagram_url (src/db/schema.ts, R-PROF-5).
  socialLinkMaxChars: { fixed: 200 },
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
  // A feedback message, so one cannot fill the outbound log (R-FB-1).
  feedbackMaxChars: { fixed: 4000 },
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
  // Hosts open member search; off until they do (R-FIND-1).
  memberSearch: {
    env: 'MEMBER_SEARCH',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
  },
  // The shortest term a search runs on, so one letter cannot list everyone
  // (R-FIND-2).
  memberSearchMinChars: { env: 'MEMBER_SEARCH_MIN_CHARS', default: 2 },
  // Search answers a query with a few cards, never a directory (R-FIND-3).
  memberSearchMaxResults: { env: 'MEMBER_SEARCH_MAX_RESULTS', default: 20 },
  // Hosts open social links on profiles; off until they do (R-PROF-5).
  socialLinks: {
    env: 'SOCIAL_LINKS',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
  },
  // Hosts open connect codes; off until they do (R-CODE-1).
  connectCodes: {
    env: 'CONNECT_CODES',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
  },
  // How long each live code is shown before the next replaces it
  // (R-CODE-5, R-CODE-8).
  liveCodeSeconds: {
    env: 'LIVE_CODE_SECONDS',
    default: 30,
    changeable: { min: 10, max: 120 },
  },
  // How long a replaced live code still works, so a scan begun at the end
  // of its time succeeds (R-CODE-5, R-CODE-8).
  liveCodeGraceSeconds: {
    env: 'LIVE_CODE_GRACE_SECONDS',
    default: 10,
    zeroAllowed: true,
    changeable: { min: 0, max: 30 },
  },
  // How long a spent live code waits for its owner's screen to report it
  // before the tick deletes it (R-CODE-6).
  liveCodeKeepMinutes: { env: 'LIVE_CODE_KEEP_MINUTES', default: 60 },
  // Direct requests a member may send in a day, so search cannot be used to
  // ask everyone (R-FIND-7).
  directRequestsPerDay: { env: 'DIRECT_REQUESTS_PER_DAY', default: 50 },
  // Hosts open each member's summit recap when the summit ends (R-RECAP-1).
  recap: {
    env: 'RECAP',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
  },
  // When the recap opens by itself, in whole minutes since 1970 in UTC; 0
  // for no time set (R-RECAP-8).
  recapOpensAt: {
    env: 'RECAP_OPENS_AT',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 99_999_999 },
  },
  // How long each story of the recap stays before moving on (R-RECAP-1).
  recapStorySeconds: {
    env: 'RECAP_STORY_SECONDS',
    default: 6,
    changeable: { min: 2, max: 30 },
  },
  // The two network stories play their animation in the first half and
  // hold its end for the second, so it can be read (R-RECAP-1).
  recapNetworkStorySeconds: {
    env: 'RECAP_NETWORK_STORY_SECONDS',
    default: 10,
    changeable: { min: 4, max: 60 },
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
  // A comparison below this share of members reads as a put-down, so it is
  // left out (R-RECAP-3).
  recapMinShare: {
    env: 'RECAP_MIN_SHARE',
    default: 50,
    changeable: { min: 1, max: 99 },
  },
  // Reports name who made them, so handled ones go after this (R-MOD-11).
  reportRetentionDays: { env: 'REPORT_RETENTION_DAYS', default: 180 },
  // The largest SVG logo an event badge takes, kept well inside the 64 kB a
  // request body may be once it is JSON (R-BADGE-5).
  badgeLogoMaxBytes: { env: 'BADGE_LOGO_MAX_BYTES', default: 32_768 },
  // Hosts turn badges off and on; while off they are still earned, quietly
  // (R-BADGE-15).
  badges: {
    env: 'BADGES',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
  },
  // Hosts choose the colour mode a browser starts in until it picks one:
  // calm while off, happy while on (R-LOOK-6).
  happyModeDefault: {
    env: 'HAPPY_MODE_DEFAULT',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
  },
  // Hosts open profile photos; off until they do, and photos already added
  // are kept while off (R-PROF-6).
  profilePhotos: {
    env: 'PROFILE_PHOTOS',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
  },
  // The largest profile photo taken, and the request body of that one route
  // (R-PROF-6, ADR 0066).
  photoMaxBytes: { env: 'PHOTO_MAX_BYTES', default: 200_000 },
  // The side of the square the browser scales a photo to, and the widest the
  // server takes (R-PROF-6).
  photoSidePx: { fixed: 512 },
  // How far in a member can zoom when framing their photo (R-PROF-6).
  photoMaxZoom: { fixed: 4 },
  // How far one arrow key moves, and one key or wheel step zooms, the photo
  // being framed (R-PROF-6).
  photoKeyStepPx: { fixed: 12 },
  photoZoomStep: { fixed: 0.25 },
  // The JPEG quality the browser encodes a photo at, from 0 to 1 (R-PROF-6).
  photoJpegQuality: { fixed: 0.85 },
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
