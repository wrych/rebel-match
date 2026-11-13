import { shownAbuse } from './abuse.js'
import {
  boundsOf,
  isSettingKey,
  valueOf,
  type SettingKey,
  type SettingValues,
} from './changeable-settings.js'
import type { Config } from './config.js'
import { bossJobs, type BossJob, type GameKey } from './game/tuning.js'
import { shownLimits } from './limits.js'
import {
  shownGameDayAllowance,
  shownNotificationWorker,
  shownServer,
  shownSmtp,
} from './server-settings.js'
import {
  PERCENT,
  prefixed,
  SECONDS,
  type Shown,
  type ShownSpec,
  type Unit,
} from './setting-specs.js'
import type { SettingOverride } from './services/settings.js'

/** How a changeable setting is edited: its current number and bounds. */
export interface SettingEdit {
  key: SettingKey
  /** A number field, an on/off switch storing 1 or 0, or a moment storing
   * whole minutes since 1970 in UTC, 0 for none. */
  kind: 'number' | 'switch' | 'moment'
  value: number
  unit: string
  min: number
  max: number
}

/** A change made in the app: who made it, when, and what it replaced. */
export interface SettingChange {
  by: string | null
  at: string
  deploymentValue: string
}

/** One setting as the host tools show it (R-CFG-5, R-CFG-6). */
export interface SettingView {
  name: string
  explanation: string
  /** The value with its unit, ready to read: "15 minutes", "On". */
  value: string
  changed: boolean
  fixed: boolean
  edit?: SettingEdit
  override?: SettingChange
}

export interface SettingsGroup {
  title: string
  explanation: string
  settings: SettingView[]
}

/** The values in force and the changes hosts made, for the changeable
 * settings. */
export interface SettingsState {
  current: SettingValues
  deployment: SettingValues
  overrides: readonly SettingOverride[]
}

/** A changeable setting (R-CFG-6), read by its key. */
interface Changeable extends Shown {
  key: SettingKey
}

/** A value hosts only read: set by the deployment, or fixed in code. */
interface ReadOnly extends Shown {
  /** Fixed in code: no deployment can change it. */
  fixed?: true
  read: (config: Config) => string | number
}

interface FromSpec extends ShownSpec {
  read: (config: Config) => number
}

function readSpecs<G extends string, K extends string>(
  group: G,
  shown: Readonly<Record<K, ShownSpec>>,
  values: (config: Config) => Readonly<Record<K, number>>,
): Record<`${G}.${K}`, FromSpec> {
  const keys = Object.keys(shown) as K[]
  return prefixed(
    group,
    Object.fromEntries(
      keys.map((key) => [
        key,
        { ...shown[key], read: (config: Config) => values(config)[key] },
      ]),
    ) as Record<K, FromSpec>,
  )
}

const shownSpecs = {
  ...readSpecs('limits', shownLimits, (c) => c.limits),
  ...readSpecs('abuse', shownAbuse, (c) => c.abuse),
  ...readSpecs('server', shownServer, (c) => c),
  ...readSpecs(
    'notificationWorker',
    shownNotificationWorker,
    (c) => c.notificationWorker,
  ),
  ...readSpecs(
    'gameDayAllowance',
    shownGameDayAllowance,
    (c) => c.gameDayAllowance,
  ),
  ...readSpecs('smtp', shownSmtp, (c) => c.mail.smtp),
}

/** A setting whose spec describes how hosts see it. */
type SpecRef = keyof typeof shownSpecs

type Entry = SpecRef | Changeable | ReadOnly

interface Group {
  title: string
  explanation: string
  entries: Entry[]
}

interface Resolved extends Shown {
  fixed: boolean
  key?: SettingKey
  read: (config: Config) => string | number
}

function fromSpec(ref: SpecRef): Resolved {
  const { as, read, ...shown } = shownSpecs[ref]
  return {
    ...shown,
    ...(isSettingKey(ref) ? { key: ref } : {}),
    read: (config) => (as === undefined ? read(config) : as(read(config))),
  }
}

function resolve(entry: Entry): Resolved {
  if (typeof entry === 'string') return fromSpec(entry)
  if ('key' in entry)
    return {
      ...entry,
      fixed: false,
      read: (config) => valueOf(config, entry.key),
    }
  return { ...entry, fixed: entry.fixed === true }
}

function withUnit(value: string | number, unit: Unit | undefined): string {
  if (typeof value === 'string' || unit === undefined) return String(value)
  return `${value.toLocaleString('en')} ${value === 1 ? unit[0] : unit[1]}`
}

const onOff = (on: boolean): string => (on ? 'On' : 'Off')
const MS_PER_MINUTE = 60_000
const ISO_MINUTE = 16

// A moment as it reads in any time zone: "2026-11-08 17:00 UTC".
function momentOf(minutes: number): string {
  if (minutes === 0) return 'Not set'
  const iso = new Date(minutes * MS_PER_MINUTE).toISOString()
  return `${iso.slice(0, ISO_MINUTE).replace('T', ' ')} UTC`
}

const EMPLOYEES: Unit = ['employee', 'employees']

const jobNames: Readonly<Record<BossJob, string>> = {
  teamLead: 'Team Lead',
  manager: 'Manager',
  director: 'Director',
  vp: 'VP',
  ceo: 'CEO',
}

function gameEntry(
  key: GameKey,
  name: string,
  explanation: string,
  unit: Unit,
): Entry {
  return {
    name,
    explanation,
    key: `game.${key}`,
    unit,
  }
}

function jobGroup(job: BossJob): Group {
  const meetings: Entry[] =
    job === 'teamLead'
      ? []
      : [
          gameEntry(
            `${job}.meetingSeats`,
            'Seats in a meeting',
            'How many employees nearest the meeting room join a meeting.',
            EMPLOYEES,
          ),
        ]
  return {
    title: `9toRevolution: ${jobNames[job]}`,
    explanation: `Boss mode as ${jobNames[job]}, three days of the game.`,
    entries: [
      gameEntry(
        `${job}.employees`,
        'Employees',
        'How many people work on this floor; never more than it has cubicles.',
        EMPLOYEES,
      ),
      gameEntry(
        `${job}.coolers`,
        'Water coolers',
        'Where employees chat, and a rebel tempts the other one.',
        ['cooler', 'coolers'],
      ),
      gameEntry(
        `${job}.morningRebels`,
        'Rebels arriving in the morning',
        'How many employees walk in already as rebels each day.',
        ['rebel', 'rebels'],
      ),
      gameEntry(
        `${job}.temptationEverySeconds`,
        'A screen turns to Corporate Rebels every',
        'On average, how often a grey employee becomes tempted.',
        SECONDS,
      ),
      gameEntry(
        `${job}.temptedGraceSeconds`,
        'A tempted employee turns rebel after',
        'How long the boss has to bring a file.',
        SECONDS,
      ),
      ...meetings,
    ],
  }
}

const gameGroups: Group[] = [
  {
    title: '9toRevolution',
    explanation:
      'The office game behind About & legal, in happy mode. A change applies ' +
      'from the next day a player starts.',
    entries: [
      {
        name: 'The game',
        explanation:
          'On shows the game to members in happy mode; off hides it, and ' +
          'every game address answers as not found.',
        key: 'game.enabled',
        switch: true,
      },
      gameEntry(
        'dayLengthSeconds',
        'A working day lasts',
        'From 09:00 to 17:00 on the game’s clock.',
        SECONDS,
      ),
      gameEntry(
        'fileWorkSeconds',
        'An employee works on a file for',
        'How long an employee stays busy with a file the boss brought.',
        SECONDS,
      ),
      gameEntry(
        'coolerVisitEverySeconds',
        'Someone walks to a water cooler every',
        'On average, in either mode.',
        SECONDS,
      ),
      gameEntry(
        'coolerChatSeconds',
        'A rebel tempts a colleague at the cooler after',
        'How long they chat before the other one is tempted.',
        SECONDS,
      ),
      gameEntry(
        'speechSeconds',
        'Breaking up the cooler takes',
        'How long the boss talks before everyone goes back to work.',
        SECONDS,
      ),
      'server.gameRecordsPerMinute',
      'server.gameLeaderboardSize',
      'gameDayAllowance.factor',
      'gameDayAllowance.extraSeconds',
      gameEntry(
        'meetingSeconds',
        'A meeting lasts',
        'The boss is stuck in the meeting room meanwhile.',
        SECONDS,
      ),
      gameEntry(
        'quietStartSeconds',
        'No screen turns before',
        'Seconds after 09:00, so the boss can get going.',
        SECONDS,
      ),
      gameEntry(
        'rampStartPercent',
        'Screens turn in the morning at',
        'Of the average rate; it rises through the day to the afternoon’s.',
        ['percent', 'percent'],
      ),
      gameEntry(
        'rampEndPercent',
        'Screens turn in the afternoon at',
        'Of the average rate, by 17:00. The day keeps its average.',
        ['percent', 'percent'],
      ),
      gameEntry(
        'arrivalGapMs',
        'Employees walk in at 09:00, one every',
        'How far apart they come through the entrance.',
        ['millisecond', 'milliseconds'],
      ),
      gameEntry(
        'coolerLoneWaitSeconds',
        'Someone alone at a cooler goes back after',
        'When nobody joins them for a chat.',
        SECONDS,
      ),
      gameEntry(
        'doorOpenSeconds',
        'The office door swings shut after about',
        'Each time it was opened; every wait varies around this.',
        SECONDS,
      ),
    ],
  },
  ...bossJobs.map(jobGroup),
  {
    title: '9toRevolution: rebel mode',
    explanation: 'The game in reverse, from level 16 on.',
    entries: [
      gameEntry(
        'rebel.morningGrey',
        'Grey employees arriving in the morning',
        'How many walk in grey each day.',
        EMPLOYEES,
      ),
      gameEntry(
        'rebel.fileEverySeconds',
        'A file lands on a desk every',
        'At level 16; each level after it is quicker.',
        SECONDS,
      ),
      gameEntry(
        'rebel.fileStepPercent',
        'Files come quicker per level by',
        'How much shorter the wait between files gets each level.',
        ['percent', 'percent'],
      ),
      gameEntry(
        'rebel.fileFloorSeconds',
        'Files never come quicker than every',
        'The shortest wait between files, however high the level.',
        SECONDS,
      ),
      gameEntry(
        'rebel.heatStageSeconds',
        'Heat rises one stage every',
        'While a file waits on the desk: warm, hot, boiling, then grey.',
        SECONDS,
      ),
      gameEntry(
        'rebel.helpSeconds',
        'Helping with a file takes',
        'How long the player stands at the desk.',
        SECONDS,
      ),
      gameEntry(
        'rebel.breakSeconds',
        'A break lasts',
        'The employee is away, receives no file, and comes back cool.',
        SECONDS,
      ),
      gameEntry(
        'rebel.breakCooldownSeconds',
        'One break every',
        'How long before the player can send someone on a break again.',
        SECONDS,
      ),
      gameEntry(
        'rebel.talkSeconds',
        'Talking someone back into a rebel takes',
        'At their desk or at a cooler.',
        SECONDS,
      ),
      gameEntry(
        'rebel.masterclassSeats',
        'Grey employees one masterclass takes',
        'The player chooses them at their desk, once a day.',
        EMPLOYEES,
      ),
      gameEntry(
        'rebel.masterclassSeconds',
        'A masterclass lasts',
        'Two grey employees are away, and come back as rebels.',
        SECONDS,
      ),
    ],
  },
]

const described = (entry: Resolved): { name: string; explanation: string } => ({
  name: entry.name,
  explanation: entry.explanation,
})

// The catalogue: every value a host might ask about, in plain words. Secrets
// are absent, and a secret's presence shows only as on or off.
const catalogue: Group[] = [
  {
    title: 'Spam protection',
    explanation:
      'Limits that stop scripts from flooding inboxes or the approvals list. ' +
      'Each server counts on its own, and a restart starts the counts afresh.',
    entries: [
      'abuse.linkEmailsBeforeCheck',
      'abuse.linkEmailsCeiling',
      'abuse.linkEmailWindowMinutes',
      'abuse.authRequestsPerIp',
      'abuse.ipWindowMinutes',
      'abuse.applicantsBeforeCheck',
      'abuse.applicantsCeiling',
      'abuse.applicantWindowMinutes',
      'abuse.humanCheckCost',
      'abuse.humanCheckMinutes',
      'abuse.liveCodesPerMinute',
      'abuse.feedbackCeiling',
      'abuse.feedbackWindowMinutes',
      'server.trustProxy',
    ],
  },
  {
    title: 'Signing in',
    explanation: 'How long sign-in links and sessions last.',
    entries: [
      'limits.magicLinkTtlMinutes',
      'limits.approvalLinkTtlHours',
      'server.sessionTtlDays',
    ],
  },
  {
    title: 'Invite links',
    explanation: 'The starting values when a host creates an invite link.',
    entries: [
      'limits.inviteDefaultMaxUses',
      'limits.inviteDefaultHours',
      'limits.inviteMaxUsesCeiling',
    ],
  },
  {
    title: 'Asking and offering help',
    explanation: 'Rules for what members write and see.',
    entries: [
      'limits.challengeMinChars',
      'limits.challengeMaxChars',
      'limits.beenThereNoteMinChars',
      'limits.deckPageSize',
      'limits.newestChallengesShown',
      'limits.reportsPerDay',
      'limits.reportersToFlag',
      'limits.reportRetentionDays',
      'limits.reportCommentMaxChars',
      'limits.banNoteMaxChars',
      'limits.notificationsPageSize',
      'limits.connectionMessageMaxChars',
    ],
  },
  {
    title: 'Live lists',
    explanation:
      'While a screen is open and in view, it re-reads its list this often.',
    entries: [
      'limits.matchesPollSeconds',
      'limits.cockpitPollSeconds',
      'limits.challengeMatchesPollSeconds',
      'limits.notificationsPollSeconds',
      'limits.outboxPollSeconds',
      'limits.membersPollSeconds',
      'limits.applicantsPollSeconds',
      'limits.invitesPollSeconds',
      'limits.moderationPollSeconds',
      'limits.leaderboardPollSeconds',
    ],
  },
  {
    title: 'Members and profiles',
    explanation: 'Profile fields and member lists.',
    entries: [
      'limits.emailMaxChars',
      'limits.nameMaxChars',
      'limits.jobTitleMaxChars',
      'limits.orgMaxChars',
      'limits.profilePhotos',
      'limits.happyModeDefault',
      'limits.photoMaxBytes',
      'limits.photoSidePx',
      'limits.socialLinks',
      'limits.socialLinkMaxChars',
      'limits.whitelistBatchMax',
      'limits.savedTickMs',
      'limits.holdToSelectMs',
      'limits.swipeMinPx',
      'limits.pullRefreshPx',
      'limits.matchesShownFirst',
      'limits.matchesNamedFirst',
      'limits.scrollHintShare',
    ],
  },
  {
    title: 'Email',
    explanation: 'How the app sends email, and how long it keeps a record.',
    entries: [
      {
        name: 'Email delivery',
        explanation:
          'On sends email through the mail server; off only records each ' +
          'message in the outbound log, as in development.',
        read: (c) => onOff(c.mail.delivery === 'smtp'),
      },
      {
        name: 'Sender name',
        explanation: 'The name inboxes show beside the sender address.',
        read: (c) => c.mail.from.name,
      },
      {
        name: 'Sender address',
        explanation: 'The address emails come from.',
        read: (c) => c.mail.from.address,
      },
      {
        name: 'Feedback goes to',
        explanation: 'Where the feedback form sends mail.',
        read: (c) => c.feedbackTo,
      },
      {
        name: 'Mail server',
        explanation: 'The SMTP server emails go through, when delivery is on.',
        read: (c) => c.mail.smtp.host ?? 'Not set',
      },
      'smtp.port',
      'limits.outboxRetentionDays',
      'server.outboxPurgeIntervalHours',
      'limits.outboxPageSize',
      'notificationWorker.intervalSeconds',
      'notificationWorker.maxAttempts',
      'notificationWorker.firstRetrySeconds',
      'notificationWorker.holdSeconds',
      {
        name: 'Daily notification emails go out at',
        explanation:
          'For members who chose daily; one time for everyone, in the time zone below.',
        read: (c) => c.notificationWorker.dailyAt,
      },
      {
        name: 'Time zone of the daily notification email',
        explanation: 'Members’ own time zones are not known.',
        read: (c) => c.notificationWorker.timeZone,
      },
      'notificationWorker.batch',
      'limits.notificationRetentionDays',
    ],
  },
  {
    title: 'Privacy and analytics',
    explanation: 'The wording members agree to, and usage analytics.',
    entries: [
      'limits.erasureGraceDays',
      'server.erasureSweepIntervalHours',
      'server.tokenPurgeIntervalHours',
      {
        name: 'Consent wording in force',
        explanation:
          'The version of the consent members accept; a new version asks ' +
          'everyone again.',
        read: (c) => c.consentVersion,
      },
      {
        name: 'Analytics opt-in wording in force',
        explanation: 'Changes only with new wording in the code.',
        fixed: true,
        read: (c) => c.analyticsVersion,
      },
      {
        name: 'Usage analytics',
        explanation:
          'On when a Mixpanel project is connected. Only members who opted ' +
          'in are counted.',
        read: (c) => onOff(c.analytics.token !== undefined),
      },
      {
        name: 'Analytics server',
        explanation: 'Where analytics go; it must stay in the EU.',
        read: (c) => c.analytics.apiHost,
      },
    ],
  },
  {
    title: 'Server',
    explanation: 'Where and how this copy of the app runs.',
    entries: [
      {
        name: 'Environment',
        explanation:
          'production for the summit; development for previews and local ' +
          'runs.',
        read: (c) => c.env,
      },
      {
        name: 'Public address',
        explanation: 'Where members reach the app; links in emails point here.',
        read: (c) => c.publicUrl,
      },
      {
        name: 'Database',
        explanation:
          'Postgres when deployed; a local file database on a developer’s ' +
          'machine.',
        read: (c) =>
          c.database.kind === 'postgres' ? 'Postgres' : 'Local (PGlite)',
      },
      {
        name: 'Sample data',
        explanation:
          'dev fills the app with fictional people; prod loads the real ' +
          'attendee list.',
        read: (c) => c.seedProfile,
      },
    ],
  },
  {
    title: 'Badges',
    explanation: 'What members earn for what they do; only they see it.',
    entries: [
      'limits.badges',
      {
        name: 'Badge levels are earned at',
        explanation:
          'The counts for the first, second and third level of each row: challenges posted, help offered, same boats, people connected with.',
        read: (c) => c.badgeLevelCounts.join(', '),
      },
      'server.badgeCrownCheckMinutes',
    ],
  },
  {
    title: 'Experiments',
    explanation:
      'Each splits members in two by their id and shows one part a change, so ' +
      'usage data can tell which works better. 0% ends it with nobody seeing ' +
      'the change, 100% with everybody.',
    entries: [
      {
        name: 'Matches as sentences',
        explanation:
          'The share of members who see a challenge’s matches as one sentence per section, with the cards a tap away, rather than each section’s first card.',
        key: 'flags.matches_layout',
        unit: PERCENT,
      },
    ],
  },
  {
    title: 'Finding members',
    explanation:
      'Members finding each other by name, organization, job title or ' +
      'sector, or by a code one shows the other, and connecting directly, ' +
      'about no challenge.',
    entries: [
      'limits.memberSearch',
      'limits.connectCodes',
      'limits.liveCodeSeconds',
      'limits.liveCodeGraceSeconds',
    ],
  },
  {
    title: 'Network replay',
    explanation:
      'A 3D replay of how members joined and connected, ending on the ' +
      'member watching. Nobody in it is named.',
    entries: ['limits.networkReplay', 'limits.networkMinOwnConnections'],
  },
  {
    title: 'Your rebel record',
    explanation:
      'Each member’s own summit recap as stories, ending on a card to share. ' +
      'Set it to open when the summit ends.',
    entries: [
      'limits.recap',
      'limits.recapOpensAt',
      'limits.recapStorySeconds',
      'limits.recapNetworkStorySeconds',
      'limits.recapMinMembers',
      'limits.recapMinShare',
    ],
  },
  ...gameGroups,
]

function shown(entry: Shown, value: string | number): string {
  if (entry.moment === true && typeof value === 'number') return momentOf(value)
  return entry.switch === true
    ? onOff(value === 1)
    : withUnit(value, entry.unit)
}

const kindOf = (entry: Shown): SettingEdit['kind'] =>
  entry.switch === true ? 'switch' : entry.moment === true ? 'moment' : 'number'

function editOf(
  entry: Shown,
  key: SettingKey,
  state: SettingsState,
): SettingEdit {
  return {
    key,
    kind: kindOf(entry),
    value: valueOf(state.current, key),
    unit: entry.unit?.[1] ?? '',
    ...boundsOf(key),
  }
}

function overrideOf(
  entry: Shown,
  key: SettingKey,
  state: SettingsState,
): SettingChange | undefined {
  const override = state.overrides.find((candidate) => candidate.key === key)
  if (override === undefined) return undefined
  return {
    by: override.changerName,
    at: override.changedAt.toISOString(),
    deploymentValue: shown(entry, valueOf(state.deployment, key)),
  }
}

function viewOf(
  entry: Resolved,
  config: Config,
  defaults: Config,
  state: SettingsState,
): SettingView {
  const { fixed, key } = entry
  const value = shown(entry, entry.read(config))
  const view: SettingView = {
    ...described(entry),
    value,
    changed: !fixed && value !== shown(entry, entry.read(defaults)),
    fixed,
  }
  if (key === undefined) return view
  const override = overrideOf(entry, key, state)
  return {
    ...view,
    edit: editOf(entry, key, state),
    ...(override === undefined ? {} : { override }),
  }
}

/** The configuration as the host tools show it, each value beside its default,
 * and how the changeable ones are edited (R-CFG-5, R-CFG-6). Built from the
 * catalogue, so nothing reaches it unnamed. */
export function settingsView(
  config: Config,
  defaults: Config,
  state: SettingsState,
): SettingsGroup[] {
  const live: Config = {
    ...config,
    limits: state.current.limits,
    abuse: state.current.abuse,
    game: state.current.game,
    flags: state.current.flags,
  }
  return catalogue.map((group) => ({
    title: group.title,
    explanation: group.explanation,
    settings: group.entries.map((entry) =>
      viewOf(resolve(entry), live, defaults, state),
    ),
  }))
}
