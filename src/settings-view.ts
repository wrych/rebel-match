import {
  boundsOf,
  valueOf,
  type SettingKey,
  type SettingValues,
} from './changeable-settings.js'
import type { Config } from './config.js'
import { bossJobs, type BossJob, type GameKey } from './game/tuning.js'
import type { SettingOverride } from './services/settings.js'

/** How a changeable setting is edited: its current number and bounds. */
export interface SettingEdit {
  key: SettingKey
  /** A number field, or an on/off switch storing 1 or 0. */
  kind: 'number' | 'switch'
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

type Unit = readonly [one: string, many: string]

const MINUTES: Unit = ['minute', 'minutes']
const HOURS: Unit = ['hour', 'hours']
const DAYS: Unit = ['day', 'days']
const CHARACTERS: Unit = ['character', 'characters']
const MS_PER_SECOND = 1000

interface Entry {
  name: string
  explanation: string
  /** Changeable in the app (R-CFG-6). */
  key?: SettingKey
  /** Fixed in code: no deployment can change it. */
  fixed?: true
  read: (config: Config) => string | number
  unit?: Unit
  /** An on/off switch storing 1 or 0, shown as On or Off. */
  switch?: true
}

interface Group {
  title: string
  explanation: string
  entries: Entry[]
}

function withUnit(value: string | number, unit: Unit | undefined): string {
  if (typeof value === 'string' || unit === undefined) return String(value)
  return `${value.toLocaleString('en')} ${value === 1 ? unit[0] : unit[1]}`
}

const onOff = (on: boolean): string => (on ? 'On' : 'Off')

const SECONDS: Unit = ['second', 'seconds']
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
    read: (c) => c.game[key],
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
      'The office game behind the impressum, in happy mode. A change applies ' +
      'from the next day a player starts.',
    entries: [
      {
        name: 'The game',
        explanation:
          'On shows the game to members in happy mode; off hides it, and ' +
          'every game address answers as not found.',
        key: 'game.enabled',
        read: (c) => c.game.enabled,
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
      {
        name: 'Game days one member may record per minute',
        explanation:
          'More than this from one member is refused, to slow a script ' +
          'sending scores.',
        read: (c) => c.gameRecordsPerMinute,
        unit: ['day', 'days'],
      },
      {
        name: 'Places on the leaderboard',
        explanation:
          'How many players the leaderboard lists; a player below them sees ' +
          'their own place too.',
        read: (c) => c.gameLeaderboardSize,
        unit: ['place', 'places'],
      },
      {
        name: 'A game day’s record may run up to',
        explanation:
          'Day lengths, plus the seconds below, before a record is refused ' +
          'as one no day can take. A paused day’s clock stands still.',
        read: (c) => c.gameDayAllowance.factor,
        unit: ['day length', 'day lengths'],
      },
      {
        name: 'Plus',
        explanation: 'Added to the day lengths above.',
        read: (c) => c.gameDayAllowance.extraSeconds,
        unit: SECONDS,
      },
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

const described = (entry: Entry): { name: string; explanation: string } => ({
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
      {
        name: 'Sign-in emails per address, sent freely',
        explanation:
          'Sign-in emails one address can get in the time window below ' +
          'without any check.',
        key: 'abuse.linkEmailsBeforeCheck',
        read: (c) => c.abuse.linkEmailsBeforeCheck,
        unit: ['email', 'emails'],
      },
      {
        name: 'Sign-in emails per address, at most',
        explanation:
          'Past the free ones, each email up to this many needs the ' +
          'automatic human check; beyond it nothing is sent.',
        key: 'abuse.linkEmailsCeiling',
        read: (c) => c.abuse.linkEmailsCeiling,
        unit: ['email', 'emails'],
      },
      {
        name: 'Time window for sign-in emails per address',
        explanation: 'The period both email limits above count over.',
        key: 'abuse.linkEmailWindowMinutes',
        read: (c) => c.abuse.linkEmailWindowMinutes,
        unit: MINUTES,
      },
      {
        name: 'Sign-in requests per network',
        explanation:
          'Requests from one network (IP address) before it is asked to ' +
          'wait. High on purpose: a whole venue shares one Wi-Fi.',
        key: 'abuse.authRequestsPerIp',
        read: (c) => c.abuse.authRequestsPerIp,
        unit: ['request', 'requests'],
      },
      {
        name: 'Time window for sign-in requests per network',
        explanation: 'The period the request limit above counts over.',
        key: 'abuse.ipWindowMinutes',
        read: (c) => c.abuse.ipWindowMinutes,
        unit: MINUTES,
      },
      {
        name: 'New applicants per network, before a human check',
        explanation:
          'People asking to join from one network before each further one ' +
          'needs the automatic human check. Members and invite links never ' +
          'count.',
        key: 'abuse.applicantsBeforeCheck',
        read: (c) => c.abuse.applicantsBeforeCheck,
        unit: ['applicant', 'applicants'],
      },
      {
        name: 'New applicants per network, at most',
        explanation:
          'Past this many from one network, nobody more is recorded until ' +
          'the time window ends.',
        key: 'abuse.applicantsCeiling',
        read: (c) => c.abuse.applicantsCeiling,
        unit: ['applicant', 'applicants'],
      },
      {
        name: 'Time window for new applicants per network',
        explanation: 'The period both applicant limits above count over.',
        key: 'abuse.applicantWindowMinutes',
        read: (c) => c.abuse.applicantWindowMinutes,
        unit: MINUTES,
      },
      {
        name: 'Human check difficulty',
        explanation:
          'Work per try of the puzzle the browser solves (PBKDF2 ' +
          'iterations). Higher is slower for people and scripts alike.',
        key: 'abuse.humanCheckCost',
        read: (c) => c.abuse.humanCheckCost,
        unit: ['iteration', 'iterations'],
      },
      {
        name: 'Time to solve a human check',
        explanation: 'How long a puzzle can be solved and sent back.',
        key: 'abuse.humanCheckMinutes',
        read: (c) => c.abuse.humanCheckMinutes,
        unit: MINUTES,
      },
      {
        name: 'Trusted proxies in front of the server',
        explanation:
          'How many proxies are trusted to report the visitor’s address: 1 ' +
          'on Cloud Run, 0 when visitors reach the server directly. If it is ' +
          'wrong, every visitor can look like the same network.',
        read: (c) => c.trustProxy,
      },
    ],
  },
  {
    title: 'Signing in',
    explanation: 'How long sign-in links and sessions last.',
    entries: [
      {
        name: 'Sign-in link valid for',
        explanation: 'A sign-in link stops working after this long.',
        read: (c) => c.limits.magicLinkTtlMinutes,
        unit: MINUTES,
      },
      {
        name: 'Link in the approval email valid for',
        explanation:
          'The link a newly approved member receives stops working after ' +
          'this long; they can still ask for a new one.',
        read: (c) => c.limits.approvalLinkTtlHours,
        unit: HOURS,
      },
      {
        name: 'Signed out after not using the app for',
        explanation:
          'Every use restarts the period, so an active member stays signed ' +
          'in.',
        read: (c) => c.sessionTtlDays,
        unit: DAYS,
      },
    ],
  },
  {
    title: 'Invite links',
    explanation: 'The starting values when a host creates an invite link.',
    entries: [
      {
        name: 'Uses per new invite link',
        explanation:
          'Suggested when creating an invite link; can be changed per link.',
        key: 'limits.inviteDefaultMaxUses',
        read: (c) => c.limits.inviteDefaultMaxUses,
        unit: ['use', 'uses'],
      },
      {
        name: 'New invite link valid for',
        explanation:
          'Suggested when creating an invite link; can be changed per link.',
        key: 'limits.inviteDefaultHours',
        read: (c) => c.limits.inviteDefaultHours,
        unit: HOURS,
      },
      {
        name: 'Most uses one invite link can allow',
        explanation: 'The largest number of uses the database can hold.',
        fixed: true,
        read: (c) => c.limits.inviteMaxUsesCeiling,
        unit: ['use', 'uses'],
      },
    ],
  },
  {
    title: 'Asking and offering help',
    explanation: 'Rules for what members write and see.',
    entries: [
      {
        name: 'Shortest challenge',
        explanation: 'A challenge needs at least this many characters.',
        key: 'limits.challengeMinChars',
        read: (c) => c.limits.challengeMinChars,
        unit: CHARACTERS,
      },
      {
        name: 'Longest challenge',
        explanation:
          'A challenge takes at most this many characters, so a peer can read it on one phone screen.',
        read: (c) => c.limits.challengeMaxChars,
        unit: CHARACTERS,
      },
      {
        name: 'Shortest “been there” note',
        explanation:
          'A member offering help writes at least this many characters.',
        key: 'limits.beenThereNoteMinChars',
        read: (c) => c.limits.beenThereNoteMinChars,
        unit: CHARACTERS,
      },
      {
        name: 'Challenges shown per batch when offering help',
        explanation: 'How many challenges load at a time.',
        read: (c) => c.limits.deckPageSize,
        unit: ['challenge', 'challenges'],
      },
      {
        name: 'Newest challenges shown for inspiration',
        explanation:
          'How many recent challenges the trend and ask screens show.',
        read: (c) => c.limits.newestChallengesShown,
        unit: ['challenge', 'challenges'],
      },
      {
        name: 'How often the badges check for news',
        explanation:
          'While the app is open, the matches and notifications badges and the waiting requests refresh this often.',
        read: (c) => c.limits.matchesPollSeconds,
        unit: ['second', 'seconds'],
      },
      {
        name: 'Notifications shown per page',
        explanation: 'How many notifications the list loads at a time.',
        read: (c) => c.limits.notificationsPageSize,
        unit: ['notification', 'notifications'],
      },
      {
        name: 'Longest message with a connection request',
        explanation: 'Fixed by the database.',
        fixed: true,
        read: (c) => c.limits.connectionMessageMaxChars,
        unit: CHARACTERS,
      },
    ],
  },
  {
    title: 'Members and profiles',
    explanation: 'Profile fields and member lists.',
    entries: [
      {
        name: 'Longest email address',
        explanation: 'Fixed by the database.',
        fixed: true,
        read: (c) => c.limits.emailMaxChars,
        unit: CHARACTERS,
      },
      {
        name: 'Longest name',
        explanation: 'Fixed by the database.',
        fixed: true,
        read: (c) => c.limits.nameMaxChars,
        unit: CHARACTERS,
      },
      {
        name: 'Longest job title',
        explanation: 'Fixed by the database.',
        fixed: true,
        read: (c) => c.limits.jobTitleMaxChars,
        unit: CHARACTERS,
      },
      {
        name: 'Longest organization',
        explanation: 'Fixed by the database.',
        fixed: true,
        read: (c) => c.limits.orgMaxChars,
        unit: CHARACTERS,
      },
      {
        name: 'Addresses per attendee list upload',
        explanation: 'The most addresses one upload to the whitelist can add.',
        read: (c) => c.limits.whitelistBatchMax,
        unit: ['address', 'addresses'],
      },
      {
        name: '“Saved” tick shown for',
        explanation: 'How long the tick stays beside a saved profile setting.',
        fixed: true,
        read: (c) => c.limits.savedTickMs / MS_PER_SECOND,
        unit: ['second', 'seconds'],
      },
      {
        name: 'Hold a member card to start selecting for',
        explanation:
          'How long a host holds a card in the members list before it is selected.',
        fixed: true,
        read: (c) => c.limits.holdToSelectMs / MS_PER_SECOND,
        unit: ['second', 'seconds'],
      },
      {
        name: 'Swipe a challenge card to browse across',
        explanation:
          'How far a finger moves across a card in the deck before the next or previous challenge shows.',
        fixed: true,
        read: (c) => c.limits.swipeMinPx,
        unit: ['pixel', 'pixels'],
      },
      {
        name: 'Scroll hint on the privacy step moves',
        explanation:
          'How far one tap on the arrow scrolls the privacy summary, as a share of the screen height.',
        fixed: true,
        read: (c) => `${String(Math.round(c.limits.scrollHintShare * 100))}%`,
      },
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
        name: 'Sender address',
        explanation: 'The address emails come from.',
        read: (c) => c.mail.from,
      },
      {
        name: 'Feedback goes to',
        explanation: 'Where the Feedback link in the menu sends mail.',
        read: (c) => c.feedbackTo,
      },
      {
        name: 'Mail server',
        explanation: 'The SMTP server emails go through, when delivery is on.',
        read: (c) => c.mail.smtp.host ?? 'Not set',
      },
      {
        name: 'Mail server port',
        explanation: 'The port of the mail server.',
        read: (c) => String(c.mail.smtp.port),
      },
      {
        name: 'Keep outbound log entries for',
        explanation: 'Entries hold email addresses, so older ones are deleted.',
        read: (c) => c.limits.outboxRetentionDays,
        unit: DAYS,
      },
      {
        name: 'Delete old log entries every',
        explanation: 'How often the server clears entries past that period.',
        read: (c) => c.outboxPurgeIntervalHours,
        unit: HOURS,
      },
      {
        name: 'Entries per page in the outbound log',
        explanation: 'How many log entries the host tools show at once.',
        read: (c) => c.limits.outboxPageSize,
        unit: ['entry', 'entries'],
      },
      {
        name: 'Send notification emails every',
        explanation: 'How often the server mails the notifications due.',
        read: (c) => c.notificationWorker.intervalSeconds,
        unit: ['second', 'seconds'],
      },
      {
        name: 'Tries before a notification email counts as failed',
        explanation:
          'A refused email is tried again, waiting longer each time, this many times in all.',
        read: (c) => c.notificationWorker.maxAttempts,
        unit: ['try', 'tries'],
      },
      {
        name: 'First retry of a refused notification email after',
        explanation:
          'Each retry after it waits twice as long as the one before.',
        read: (c) => c.notificationWorker.firstRetrySeconds,
        unit: ['second', 'seconds'],
      },
      {
        name: 'A server holds the notifications it is mailing for',
        explanation:
          'Another server leaves them alone this long, so none is mailed twice.',
        read: (c) => c.notificationWorker.holdSeconds,
        unit: ['second', 'seconds'],
      },
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
      {
        name: 'Notification emails per round, at most',
        explanation: 'The rest wait for the next round.',
        read: (c) => c.notificationWorker.batch,
        unit: ['email', 'emails'],
      },
      {
        name: 'Keep notifications for',
        explanation:
          'Notifications name other members, so older ones are deleted with the old log entries.',
        read: (c) => c.limits.notificationRetentionDays,
        unit: DAYS,
      },
    ],
  },
  {
    title: 'Privacy and analytics',
    explanation: 'The wording members agree to, and usage analytics.',
    entries: [
      {
        name: 'Deleted accounts are erased after',
        explanation:
          'A deleted account is hidden at once and erased after this long, ' +
          'so the member or a host can still undo it until then.',
        read: (c) => c.limits.erasureGraceDays,
        unit: DAYS,
      },
      {
        name: 'Erase due accounts every',
        explanation: 'How often the server erases accounts past that period.',
        read: (c) => c.erasureSweepIntervalHours,
        unit: HOURS,
      },
      {
        name: 'Delete expired sign-ins every',
        explanation:
          'How often the server deletes sessions and sign-in links past ' +
          'their lifetime.',
        read: (c) => c.tokenPurgeIntervalHours,
        unit: HOURS,
      },
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
  ...gameGroups,
]

function shown(entry: Entry, value: string | number): string {
  return entry.switch === true
    ? onOff(value === 1)
    : withUnit(value, entry.unit)
}

function editOf(
  entry: Entry,
  key: SettingKey,
  state: SettingsState,
): SettingEdit {
  return {
    key,
    kind: entry.switch === true ? 'switch' : 'number',
    value: valueOf(state.current, key),
    unit: entry.unit?.[1] ?? '',
    ...boundsOf(key),
  }
}

function overrideOf(
  entry: Entry,
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
  entry: Entry,
  config: Config,
  defaults: Config,
  state: SettingsState,
): SettingView {
  const value = shown(entry, entry.read(config))
  const view: SettingView = {
    ...described(entry),
    value,
    changed:
      entry.fixed !== true && value !== shown(entry, entry.read(defaults)),
    fixed: entry.fixed === true,
  }
  if (entry.key === undefined) return view
  const override = overrideOf(entry, entry.key, state)
  return {
    ...view,
    edit: editOf(entry, entry.key, state),
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
  }
  return catalogue.map((group) => ({
    title: group.title,
    explanation: group.explanation,
    settings: group.entries.map((entry) =>
      viewOf(entry, live, defaults, state),
    ),
  }))
}
