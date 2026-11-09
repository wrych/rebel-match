import {
  changeableOf,
  envOf,
  MINUTES,
  shownOf,
  valuesFrom,
  type Bounds,
  type ShownKey,
  type ShownSpec,
  type Specs,
  type Unit,
  type ValuesOf,
} from './setting-specs.js'

const MINUTES_PER_DAY = 1440
const EMAILS: Unit = ['email', 'emails']
const APPLICANTS: Unit = ['applicant', 'applicants']

// Abuse limits on sign-in (R-NFR-8, ADR 0029). Each is changeable within
// bounds wide enough for a crowded room, narrow enough that no value locks
// everyone out or hangs a phone on the human check (ADR 0031).
const abuseSpecs = {
  linkEmailsBeforeCheck: {
    env: 'LINK_EMAILS_BEFORE_CHECK',
    default: 3,
    zeroAllowed: true,
    changeable: { min: 0, max: 100 },
    shown: {
      name: 'Sign-in emails per address, sent freely',
      explanation:
        'Sign-in emails one address can get in the time window below ' +
        'without any check.',
      unit: EMAILS,
    },
  },
  linkEmailsCeiling: {
    env: 'LINK_EMAILS_CEILING',
    default: 10,
    changeable: { min: 1, max: 1000 },
    shown: {
      name: 'Sign-in emails per address, at most',
      explanation:
        'Past the free ones, each email up to this many needs the ' +
        'automatic human check; beyond it nothing is sent.',
      unit: EMAILS,
    },
  },
  linkEmailWindowMinutes: {
    env: 'LINK_EMAIL_WINDOW_MINUTES',
    default: 15,
    changeable: { min: 1, max: MINUTES_PER_DAY },
    shown: {
      name: 'Time window for sign-in emails per address',
      explanation: 'The period both email limits above count over.',
      unit: MINUTES,
    },
  },
  authRequestsPerIp: {
    env: 'AUTH_REQUESTS_PER_IP',
    default: 1000,
    changeable: { min: 1, max: 100_000 },
    shown: {
      name: 'Sign-in requests per network',
      explanation:
        'Requests from one network (IP address) before it is asked to ' +
        'wait. High on purpose: a whole venue shares one Wi-Fi.',
      unit: ['request', 'requests'],
    },
  },
  ipWindowMinutes: {
    env: 'IP_WINDOW_MINUTES',
    default: 15,
    changeable: { min: 1, max: MINUTES_PER_DAY },
    shown: {
      name: 'Time window for sign-in requests per network',
      explanation: 'The period the request limit above counts over.',
      unit: MINUTES,
    },
  },
  applicantsBeforeCheck: {
    env: 'APPLICANTS_BEFORE_CHECK',
    default: 30,
    zeroAllowed: true,
    changeable: { min: 0, max: 10_000 },
    shown: {
      name: 'New applicants per network, before a human check',
      explanation:
        'People asking to join from one network before each further one ' +
        'needs the automatic human check. Members and invite links never ' +
        'count.',
      unit: APPLICANTS,
    },
  },
  applicantsCeiling: {
    env: 'APPLICANTS_CEILING',
    default: 300,
    changeable: { min: 1, max: 100_000 },
    shown: {
      name: 'New applicants per network, at most',
      explanation:
        'Past this many from one network, nobody more is recorded until ' +
        'the time window ends.',
      unit: APPLICANTS,
    },
  },
  applicantWindowMinutes: {
    env: 'APPLICANT_WINDOW_MINUTES',
    default: 60,
    changeable: { min: 1, max: MINUTES_PER_DAY },
    shown: {
      name: 'Time window for new applicants per network',
      explanation: 'The period both applicant limits above count over.',
      unit: MINUTES,
    },
  },
  humanCheckCost: {
    env: 'HUMAN_CHECK_COST',
    default: 1000,
    changeable: { min: 100, max: 20_000 },
    shown: {
      name: 'Human check difficulty',
      explanation:
        'Work per try of the puzzle the browser solves (PBKDF2 ' +
        'iterations). Higher is slower for people and scripts alike.',
      unit: ['iteration', 'iterations'],
    },
  },
  humanCheckMinutes: {
    env: 'HUMAN_CHECK_MINUTES',
    default: 5,
    changeable: { min: 1, max: 60 },
    shown: {
      name: 'Time to solve a human check',
      explanation: 'How long a puzzle can be solved and sent back.',
      unit: MINUTES,
    },
  },
  // The floor is the seven a minute a screen asks for at its shortest
  // setting (R-CODE-5).
  liveCodesPerMinute: {
    env: 'LIVE_CODES_PER_MINUTE',
    default: 20,
    changeable: { min: 7, max: 600 },
    shown: {
      name: 'Live codes per member a minute',
      explanation:
        'New live codes one member’s screen may ask for in a minute; ' +
        'past it the screen hides its code until its next turn. The ' +
        'screen asks about seven times a minute at its fastest.',
      unit: ['code', 'codes'],
    },
  },
  // R-FB-2.
  feedbackCeiling: {
    env: 'FEEDBACK_CEILING',
    default: 10,
    changeable: { min: 1, max: 1000 },
    shown: {
      name: 'Feedback per member or network, at most',
      explanation:
        'Feedback messages one member, or one network when not signed ' +
        'in, may send before being asked to wait. Visitors also pass the ' +
        'human check for each one.',
      unit: ['message', 'messages'],
    },
  },
  feedbackWindowMinutes: {
    env: 'FEEDBACK_WINDOW_MINUTES',
    default: 60,
    changeable: { min: 1, max: MINUTES_PER_DAY },
    shown: {
      name: 'Time window for feedback',
      explanation: 'The period the feedback limit above counts over.',
      unit: MINUTES,
    },
  },
} as const satisfies Specs

type AbuseSpecs = typeof abuseSpecs

/** The sign-in abuse limits (R-NFR-8, ADR 0029). Kept out of `Limits`, so
 * `GET /api/config` never tells a script how far it can go. */
export type AbuseLimits = ValuesOf<AbuseSpecs>

/** The environment variables that set the abuse limits (R-CFG-1). */
export const abuseEnv = envOf(abuseSpecs)

/** The abuse limits as a deployment's parsed environment sets them. */
export const abuseLimitsFrom = (
  env: Parameters<typeof valuesFrom<AbuseSpecs>>[1],
): AbuseLimits => valuesFrom(abuseSpecs, env)

/** The bounds hosts may set each abuse limit within (ADR 0031). */
export const changeableAbuse: Readonly<Record<keyof AbuseLimits, Bounds>> =
  changeableOf(abuseSpecs)

/** An abuse limit the host tools show as its spec describes it. */
export type ShownAbuseKey = ShownKey<AbuseSpecs>

/** How the host tools show each abuse limit (R-CFG-5). */
export const shownAbuse: Readonly<Record<ShownAbuseKey, ShownSpec>> =
  shownOf(abuseSpecs)
