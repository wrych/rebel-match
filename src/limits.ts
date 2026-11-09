import {
  changeableOf,
  CHARACTERS,
  DAYS,
  envOf,
  HOURS,
  MINUTES,
  PERCENT,
  PIXELS,
  SECONDS,
  shownOf,
  valuesFrom,
  type Bounds,
  type ChangeableKey,
  type ShownKey,
  type ShownSpec,
  type Specs,
  type Unit,
  type ValuesOf,
} from './setting-specs.js'

// Often enough to feel live, never so often that open screens flood the
// server (ADR 0050).
const POLL: Bounds = { min: 2, max: 3600 }

const MS_PER_SECOND = 1000
const BYTES_PER_KB = 1000
const PERCENT_PER_WHOLE = 100
const CHALLENGES: Unit = ['challenge', 'challenges']
const USES: Unit = ['use', 'uses']
const MEMBERS: Unit = ['member', 'members']
const BY_THE_DATABASE = 'Fixed by the database.'
const INVITE_SUGGESTION =
  'Suggested when creating an invite link; can be changed per link.'

const limitSpecs = {
  challengeMinChars: {
    env: 'CHALLENGE_MIN_CHARS',
    default: 31,
    changeable: { min: 1, max: 300 },
    shown: {
      name: 'Shortest challenge',
      explanation: 'A challenge needs at least this many characters.',
      unit: CHARACTERS,
    },
  },
  // R-ASK-3.
  challengeMaxChars: {
    env: 'CHALLENGE_MAX_CHARS',
    default: 500,
    shown: {
      name: 'Longest challenge',
      explanation:
        'A challenge takes at most this many characters, so a peer can read it on one phone screen.',
      unit: CHARACTERS,
    },
  },
  beenThereNoteMinChars: {
    env: 'BEEN_THERE_NOTE_MIN_CHARS',
    default: 31,
    changeable: { min: 1, max: 300 },
    shown: {
      name: 'Shortest “been there” note',
      explanation:
        'A member offering help writes at least this many characters.',
      unit: CHARACTERS,
    },
  },
  magicLinkTtlMinutes: {
    env: 'MAGIC_LINK_TTL_MINUTES',
    default: 15,
    shown: {
      name: 'Sign-in link valid for',
      explanation: 'A sign-in link stops working after this long.',
      unit: MINUTES,
    },
  },
  approvalLinkTtlHours: {
    env: 'APPROVAL_LINK_TTL_HOURS',
    default: 24,
    shown: {
      name: 'Link in the approval email valid for',
      explanation:
        'The link a newly approved member receives stops working after ' +
        'this long; they can still ask for a new one.',
      unit: HOURS,
    },
  },
  inviteDefaultMaxUses: {
    env: 'INVITE_DEFAULT_MAX_USES',
    default: 400,
    changeable: { min: 1, max: 100_000 },
    shown: {
      name: 'Uses per new invite link',
      explanation: INVITE_SUGGESTION,
      unit: USES,
    },
  },
  inviteDefaultHours: {
    env: 'INVITE_DEFAULT_HOURS',
    default: 12,
    changeable: { min: 1, max: 720 },
    shown: {
      name: 'New invite link valid for',
      explanation: INVITE_SUGGESTION,
      unit: HOURS,
    },
  },
  outboxRetentionDays: {
    env: 'OUTBOX_RETENTION_DAYS',
    default: 30,
    shown: {
      name: 'Keep outbound log entries for',
      explanation: 'Entries hold email addresses, so older ones are deleted.',
      unit: DAYS,
    },
  },
  // R-NOTE-11.
  notificationRetentionDays: {
    env: 'NOTIFICATION_RETENTION_DAYS',
    default: 90,
    shown: {
      name: 'Keep notifications for',
      explanation:
        'Notifications name other members, so older ones are deleted with the old log entries.',
      unit: DAYS,
    },
  },
  // ADR 0032.
  erasureGraceDays: {
    env: 'ERASURE_GRACE_DAYS',
    default: 30,
    shown: {
      name: 'Deleted accounts are erased after',
      explanation:
        'A deleted account is hidden at once and erased after this long, ' +
        'so the member or a host can still undo it until then.',
      unit: DAYS,
    },
  },
  outboxPageSize: {
    env: 'OUTBOX_PAGE_SIZE',
    default: 100,
    shown: {
      name: 'Entries per page in the outbound log',
      explanation: 'How many log entries the host tools show at once.',
      unit: ['entry', 'entries'],
    },
  },
  deckPageSize: {
    env: 'DECK_PAGE_SIZE',
    default: 20,
    shown: {
      name: 'Challenges shown per batch when offering help',
      explanation: 'How many challenges load at a time.',
      unit: CHALLENGES,
    },
  },
  newestChallengesShown: {
    env: 'NEWEST_CHALLENGES_SHOWN',
    default: 3,
    shown: {
      name: 'Newest challenges shown for inspiration',
      explanation: 'How many recent challenges the trend and ask screens show.',
      unit: CHALLENGES,
    },
  },
  // How often each live list re-reads while it is open (R-NAV-12).
  matchesPollSeconds: {
    env: 'MATCHES_POLL_SECONDS',
    default: 8,
    changeable: POLL,
    shown: {
      name: 'How often the badges check for news',
      explanation:
        'While the app is open, the matches and notifications badges refresh this often.',
      unit: SECONDS,
    },
  },
  cockpitPollSeconds: {
    env: 'COCKPIT_POLL_SECONDS',
    default: 8,
    changeable: POLL,
    shown: {
      name: 'Matches screen',
      explanation: 'The requests waiting for a member and their connections.',
      unit: SECONDS,
    },
  },
  challengeMatchesPollSeconds: {
    env: 'CHALLENGE_MATCHES_POLL_SECONDS',
    default: 8,
    changeable: POLL,
    shown: {
      name: 'A challenge’s matches',
      explanation:
        'The same boat and been there rebels of a member’s challenge.',
      unit: SECONDS,
    },
  },
  notificationsPollSeconds: {
    env: 'NOTIFICATIONS_POLL_SECONDS',
    default: 8,
    changeable: POLL,
    shown: {
      name: 'Notifications',
      explanation: 'A member’s notifications screen.',
      unit: SECONDS,
    },
  },
  outboxPollSeconds: {
    env: 'OUTBOX_POLL_SECONDS',
    default: 8,
    changeable: POLL,
    shown: {
      name: 'Outbound message log',
      explanation: 'The host tools’ log of every email.',
      unit: SECONDS,
    },
  },
  membersPollSeconds: {
    env: 'MEMBERS_POLL_SECONDS',
    default: 60,
    changeable: POLL,
    shown: {
      name: 'Members',
      explanation: 'The host tools’ members list.',
      unit: SECONDS,
    },
  },
  applicantsPollSeconds: {
    env: 'APPLICANTS_POLL_SECONDS',
    default: 60,
    changeable: POLL,
    shown: {
      name: 'Applicants',
      explanation: 'The host tools’ list of applicants.',
      unit: SECONDS,
    },
  },
  invitesPollSeconds: {
    env: 'INVITES_POLL_SECONDS',
    default: 60,
    changeable: POLL,
    shown: {
      name: 'Invites',
      explanation: 'The host tools’ invite links.',
      unit: SECONDS,
    },
  },
  moderationPollSeconds: {
    env: 'MODERATION_POLL_SECONDS',
    default: 30,
    changeable: POLL,
    shown: {
      name: 'Moderation',
      explanation: 'The host tools’ reported members.',
      unit: SECONDS,
    },
  },
  leaderboardPollSeconds: {
    env: 'LEADERBOARD_POLL_SECONDS',
    default: 30,
    changeable: POLL,
    shown: {
      name: 'Leaderboard',
      explanation: 'The 9toRevolution leaderboard.',
      unit: SECONDS,
    },
  },
  notificationsPageSize: {
    env: 'NOTIFICATIONS_PAGE_SIZE',
    default: 50,
    shown: {
      name: 'Notifications shown per page',
      explanation: 'How many notifications the list loads at a time.',
      unit: ['notification', 'notifications'],
    },
  },
  whitelistBatchMax: {
    env: 'WHITELIST_BATCH_MAX',
    default: 1000,
    shown: {
      name: 'Addresses per attendee list upload',
      explanation: 'The most addresses one upload to the whitelist can add.',
      unit: ['address', 'addresses'],
    },
  },
  // members.email and outbox.to_email (src/db/schema.ts): RFC 5321's 320.
  emailMaxChars: {
    fixed: 320,
    shown: {
      name: 'Longest email address',
      explanation: BY_THE_DATABASE,
      unit: CHARACTERS,
    },
  },
  // The widths of members.name and requested_name, job_title, org and
  // requested_org (src/db/schema.ts): a fact of the schema rather than a
  // tunable, so no environment variable.
  nameMaxChars: {
    fixed: 120,
    shown: {
      name: 'Longest name',
      explanation: BY_THE_DATABASE,
      unit: CHARACTERS,
    },
  },
  jobTitleMaxChars: {
    fixed: 120,
    shown: {
      name: 'Longest job title',
      explanation: BY_THE_DATABASE,
      unit: CHARACTERS,
    },
  },
  orgMaxChars: {
    fixed: 160,
    shown: {
      name: 'Longest organization',
      explanation: BY_THE_DATABASE,
      unit: CHARACTERS,
    },
  },
  // members.linkedin_url and instagram_url (src/db/schema.ts, R-PROF-5).
  socialLinkMaxChars: {
    fixed: 200,
    shown: {
      name: 'Longest social link',
      explanation: BY_THE_DATABASE,
      unit: CHARACTERS,
    },
  },
  // invites.label, and a cap on invites.max_uses (src/db/schema.ts).
  inviteLabelMaxChars: { fixed: 120 },
  // R-PROF-1.
  savedTickMs: {
    fixed: 2500,
    shown: {
      name: '“Saved” tick shown for',
      explanation: 'How long the tick stays beside a saved profile setting.',
      unit: SECONDS,
      as: (ms) => ms / MS_PER_SECOND,
    },
  },
  // R-MEM-3.
  holdToSelectMs: {
    fixed: 500,
    shown: {
      name: 'Hold a member card to start selecting for',
      explanation:
        'How long a host holds a card in the members list before it is selected.',
      unit: SECONDS,
      as: (ms) => ms / MS_PER_SECOND,
    },
  },
  // R-OFF-1.
  swipeMinPx: {
    fixed: 50,
    shown: {
      name: 'Swipe a challenge card to browse across',
      explanation:
        'How far a finger moves across a card in the deck before the next or previous challenge shows.',
      unit: PIXELS,
    },
  },
  // R-NAV-12.
  pullRefreshPx: {
    fixed: 70,
    shown: {
      name: 'Pull a list down to refresh it',
      explanation:
        'How far a finger pulls a live list down from the top of the page before it refreshes.',
      unit: PIXELS,
    },
  },
  // R-ASK-15.
  matchesShownFirst: {
    fixed: 1,
    shown: {
      name: 'Matches shown before “more”',
      explanation:
        'How many rebels or case studies each section of a challenge’s matches shows before the rest are a tap away.',
    },
  },
  // R-ASK-15.
  matchesNamedFirst: {
    fixed: 2,
    shown: {
      name: 'Matches named before “and others”',
      explanation:
        'How many rebels or case studies the sentence over each section of a challenge’s matches names before it counts the rest, where it shows sentences.',
    },
  },
  // Short of the whole height, so the summary never jumps to the end
  // (R-ONB-10).
  scrollHintShare: {
    fixed: 0.4,
    shown: {
      name: 'Scroll hint on the privacy step moves',
      explanation:
        'How far one tap on the arrow scrolls the privacy summary, as a share of the screen height.',
      as: (share) => `${String(Math.round(share * PERCENT_PER_WHOLE))}%`,
    },
  },
  inviteMaxUsesCeiling: {
    fixed: 0xffffffff,
    shown: {
      name: 'Most uses one invite link can allow',
      explanation: 'The largest number of uses the database can hold.',
      unit: USES,
    },
  },
  // connection_requests.message (src/db/schema.ts).
  connectionMessageMaxChars: {
    fixed: 600,
    shown: {
      name: 'Longest message with a connection request',
      explanation: BY_THE_DATABASE,
      unit: CHARACTERS,
    },
  },
  // A feedback message, so one cannot fill the outbound log (R-FB-1).
  feedbackMaxChars: { fixed: 4000 },
  // reports.comment (src/db/schema.ts).
  reportCommentMaxChars: { fixed: 500 },
  // moderation_actions.note, the reason a host gives for a ban (R-MOD-9).
  banNoteMaxChars: {
    fixed: 500,
    shown: {
      name: 'Longest reason for a ban',
      explanation: BY_THE_DATABASE,
      unit: CHARACTERS,
    },
  },
  // R-MOD-4.
  reportsPerDay: {
    env: 'REPORTS_PER_DAY',
    default: 20,
    changeable: { min: 1, max: 1000 },
    shown: {
      name: 'Reports per member per day',
      explanation:
        'How many challenges or notes one member may report a day, so ' +
        'reporting cannot be turned on someone.',
      unit: ['report', 'reports'],
    },
  },
  // R-MOD-6.
  reportersToFlag: {
    env: 'REPORTERS_TO_FLAG',
    default: 3,
    changeable: { min: 1, max: 100 },
    shown: {
      name: 'Reporters who outline a member',
      explanation:
        'On the moderation screen, a member reported by at least this ' +
        'many different members is outlined.',
      unit: MEMBERS,
    },
  },
  // R-NET-6.
  networkReplay: {
    env: 'NETWORK_REPLAY',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
    shown: {
      name: 'The replay',
      explanation:
        'On shows it to members from the menu; off hides it, and its ' +
        'address answers as not found.',
      switch: true,
    },
  },
  // R-NET-13.
  networkMinOwnConnections: {
    env: 'NETWORK_MIN_OWN_CONNECTIONS',
    default: 5,
    zeroAllowed: true,
    changeable: { min: 0, max: 100 },
    shown: {
      name: 'Own connections shown from',
      explanation:
        'A member with fewer connections sees the replay without their ' +
        'own lines, so they cannot tell who the dots at the ends are. 0 ' +
        'shows everyone their lines.',
      unit: ['connection', 'connections'],
    },
  },
  // R-FIND-1.
  memberSearch: {
    env: 'MEMBER_SEARCH',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
    shown: {
      name: 'Member search',
      explanation:
        'On lets every member search; off hides it, and its addresses ' +
        'answer as not found. Members who turned off being findable are ' +
        'never found.',
      switch: true,
    },
  },
  // The shortest term a search runs on, so one letter cannot list everyone
  // (R-FIND-2).
  memberSearchMinChars: { env: 'MEMBER_SEARCH_MIN_CHARS', default: 2 },
  // Search answers a query with a few cards, never a directory (R-FIND-3).
  memberSearchMaxResults: { env: 'MEMBER_SEARCH_MAX_RESULTS', default: 20 },
  // R-PROF-5.
  socialLinks: {
    env: 'SOCIAL_LINKS',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
    shown: {
      name: 'Social links',
      explanation:
        'On lets members add their LinkedIn and Instagram to their ' +
        'profile, shown only to members they are connected with; off ' +
        'hides them everywhere and keeps what was saved.',
      switch: true,
    },
  },
  // R-CODE-1.
  connectCodes: {
    env: 'CONNECT_CODES',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
    shown: {
      name: 'Connect codes',
      explanation:
        'On lets every member show a profile code to share and a live ' +
        'code to scan, whether or not they are findable; off hides them, ' +
        'and their addresses answer as not found.',
      switch: true,
    },
  },
  // R-CODE-5, R-CODE-8.
  liveCodeSeconds: {
    env: 'LIVE_CODE_SECONDS',
    default: 30,
    changeable: { min: 10, max: 120 },
    shown: {
      name: 'Time each live code is shown',
      explanation:
        'A live code is replaced on screen after this long, its ring ' +
        'emptying as the time runs out.',
      unit: SECONDS,
    },
  },
  // R-CODE-5, R-CODE-8.
  liveCodeGraceSeconds: {
    env: 'LIVE_CODE_GRACE_SECONDS',
    default: 10,
    zeroAllowed: true,
    changeable: { min: 0, max: 30 },
    shown: {
      name: 'Grace after a live code is replaced',
      explanation:
        'How long a replaced live code still works, so a scan begun at ' +
        'the end succeeds. Never more than the time it is shown.',
      unit: SECONDS,
    },
  },
  // How long a spent live code waits for its owner's screen to report it
  // before the tick deletes it (R-CODE-6).
  liveCodeKeepMinutes: { env: 'LIVE_CODE_KEEP_MINUTES', default: 60 },
  // Direct requests a member may send in a day, so search cannot be used to
  // ask everyone (R-FIND-7).
  directRequestsPerDay: { env: 'DIRECT_REQUESTS_PER_DAY', default: 50 },
  // R-RECAP-1.
  recap: {
    env: 'RECAP',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
    shown: {
      name: 'The recap',
      explanation:
        'On offers it to every member from the menu, whatever the opening ' +
        'time; off hides it until that time, and its address answers as ' +
        'not found.',
      switch: true,
    },
  },
  // R-RECAP-8.
  recapOpensAt: {
    env: 'RECAP_OPENS_AT',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 99_999_999 },
    shown: {
      name: 'Opens by itself at',
      explanation:
        'From this moment the recap is open as if switched on, and every ' +
        'member is told once that their record is ready. To close it ' +
        'again, switch it off and clear this.',
      moment: true,
    },
  },
  // R-RECAP-1.
  recapStorySeconds: {
    env: 'RECAP_STORY_SECONDS',
    default: 6,
    changeable: { min: 2, max: 30 },
    shown: {
      name: 'Each story stays for',
      explanation: 'Before the next one comes; a tap moves on sooner.',
      unit: SECONDS,
    },
  },
  // R-RECAP-1.
  recapNetworkStorySeconds: {
    env: 'RECAP_NETWORK_STORY_SECONDS',
    default: 10,
    changeable: { min: 4, max: 60 },
    shown: {
      name: 'Each network story stays for',
      explanation:
        'The two stories that replay the network: the animation takes the ' +
        'first half, and the second holds where it ends, to be read.',
      unit: SECONDS,
    },
  },
  // Comparisons round down to this many percent (R-RECAP-3).
  recapPercentStep: { env: 'RECAP_PERCENT_STEP', default: 5 },
  // R-RECAP-3.
  recapMinMembers: {
    env: 'RECAP_MIN_MEMBERS',
    default: 20,
    changeable: { min: 2, max: 100_000 },
    shown: {
      name: 'Members before comparing',
      explanation:
        'Below this many active members the recap compares nobody with ' +
        'anyone, since a share of a few people can point at someone.',
      unit: MEMBERS,
    },
  },
  // R-RECAP-3.
  recapMinShare: {
    env: 'RECAP_MIN_SHARE',
    default: 50,
    changeable: { min: 1, max: 99 },
    shown: {
      name: 'Least share to compare',
      explanation:
        'A comparison below this share of members is left out: “ahead of ' +
        '30%” reads as a put-down.',
      unit: PERCENT,
    },
  },
  // R-MOD-11.
  reportRetentionDays: {
    env: 'REPORT_RETENTION_DAYS',
    default: 180,
    shown: {
      name: 'Keep handled reports for',
      explanation:
        'Reports name who made them, so handled ones are deleted after ' +
        'this, or this long after the hide or ban behind them is lifted.',
      unit: DAYS,
    },
  },
  // The largest SVG logo an event badge takes, kept well inside the 64 kB a
  // request body may be once it is JSON (R-BADGE-5).
  badgeLogoMaxBytes: { env: 'BADGE_LOGO_MAX_BYTES', default: 32_768 },
  // R-BADGE-15.
  badges: {
    env: 'BADGES',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
    shown: {
      name: 'Badges',
      explanation:
        'On shows members their badges from the menu and tells them of ' +
        'new ones; off hides them, and badges are still earned, quietly, ' +
        'to show when it is turned back on.',
      switch: true,
    },
  },
  // R-LOOK-6.
  happyModeDefault: {
    env: 'HAPPY_MODE_DEFAULT',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
    shown: {
      name: 'Happy colour mode by default',
      explanation:
        'On starts every browser that has not chosen a colour mode in ' +
        'happy mode; off starts it calm. A member who chose a mode on ' +
        'their profile keeps it.',
      switch: true,
    },
  },
  // R-PROF-6.
  profilePhotos: {
    env: 'PROFILE_PHOTOS',
    default: 0,
    zeroAllowed: true,
    changeable: { min: 0, max: 1 },
    shown: {
      name: 'Profile photos',
      explanation:
        'On lets every member add a photo on their profile, shown beside ' +
        'their name to other members; off hides photos everywhere, and ' +
        'photos already added are kept.',
      switch: true,
    },
  },
  // Also the request body of that one route (R-PROF-6, ADR 0066).
  photoMaxBytes: {
    env: 'PHOTO_MAX_BYTES',
    default: 200_000,
    shown: {
      name: 'Largest profile photo',
      explanation:
        'The browser scales a photo down well below this; a larger upload is refused.',
      unit: ['kB', 'kB'],
      as: (bytes) => Math.round(bytes / BYTES_PER_KB),
    },
  },
  // Also the widest the server takes (R-PROF-6).
  photoSidePx: {
    fixed: 512,
    shown: {
      name: 'Profile photo size',
      explanation: 'The side of the square a photo is cropped and scaled to.',
      unit: PIXELS,
    },
  },
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

/** A limit the host tools show as its spec describes it. */
export type ShownLimitKey = ShownKey<LimitSpecs>

/** The environment variables that set the tunable limits (R-CFG-1). */
export const limitsEnv = envOf(limitSpecs)

/** The limits as a deployment's parsed environment sets them. */
export const limitsFrom = (
  env: Parameters<typeof valuesFrom<LimitSpecs>>[1],
): Limits => valuesFrom(limitSpecs, env)

/** The bounds of each limit hosts may change (ADR 0031). */
export const changeableLimits: Readonly<Record<ChangeableLimitKey, Bounds>> =
  changeableOf(limitSpecs)

/** How the host tools show each limit that describes itself (R-CFG-5). */
export const shownLimits: Readonly<Record<ShownLimitKey, ShownSpec>> =
  shownOf(limitSpecs)
