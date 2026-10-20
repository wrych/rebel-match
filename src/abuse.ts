import {
  changeableOf,
  envOf,
  valuesFrom,
  type Bounds,
  type Specs,
  type ValuesOf,
} from './setting-specs.js'

const MINUTES_PER_DAY = 1440

// Abuse limits on sign-in (R-NFR-8, ADR 0029). Each is changeable within
// bounds wide enough for a crowded room, narrow enough that no value locks
// everyone out or hangs a phone on the human check (ADR 0031).
const abuseSpecs = {
  linkEmailsBeforeCheck: {
    env: 'LINK_EMAILS_BEFORE_CHECK',
    default: 3,
    zeroAllowed: true,
    changeable: { min: 0, max: 100 },
  },
  linkEmailsCeiling: {
    env: 'LINK_EMAILS_CEILING',
    default: 10,
    changeable: { min: 1, max: 1000 },
  },
  linkEmailWindowMinutes: {
    env: 'LINK_EMAIL_WINDOW_MINUTES',
    default: 15,
    changeable: { min: 1, max: MINUTES_PER_DAY },
  },
  authRequestsPerIp: {
    env: 'AUTH_REQUESTS_PER_IP',
    default: 1000,
    changeable: { min: 1, max: 100_000 },
  },
  ipWindowMinutes: {
    env: 'IP_WINDOW_MINUTES',
    default: 15,
    changeable: { min: 1, max: MINUTES_PER_DAY },
  },
  applicantsBeforeCheck: {
    env: 'APPLICANTS_BEFORE_CHECK',
    default: 30,
    zeroAllowed: true,
    changeable: { min: 0, max: 10_000 },
  },
  applicantsCeiling: {
    env: 'APPLICANTS_CEILING',
    default: 300,
    changeable: { min: 1, max: 100_000 },
  },
  applicantWindowMinutes: {
    env: 'APPLICANT_WINDOW_MINUTES',
    default: 60,
    changeable: { min: 1, max: MINUTES_PER_DAY },
  },
  // PBKDF2 iterations per try of the human check's proof of work.
  humanCheckCost: {
    env: 'HUMAN_CHECK_COST',
    default: 1000,
    changeable: { min: 100, max: 20_000 },
  },
  // How long a human-check challenge can be solved and sent back.
  humanCheckMinutes: {
    env: 'HUMAN_CHECK_MINUTES',
    default: 5,
    changeable: { min: 1, max: 60 },
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
