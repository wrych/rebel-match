import type { AbuseLimits, Limits } from './config.js'

type LimitKey =
  | 'challengeMinChars'
  | 'beenThereNoteMinChars'
  | 'inviteDefaultMaxUses'
  | 'inviteDefaultHours'

/** A setting hosts may change in the app (R-CFG-6, ADR 0031). */
export type SettingKey = `limits.${LimitKey}` | `abuse.${keyof AbuseLimits}`

/** The values the changeable settings live in. */
export interface SettingValues {
  limits: Limits
  abuse: AbuseLimits
}

interface Bounds {
  min: number
  max: number
}

const MINUTES_PER_DAY = 1440

// What a host can set: wide enough for a crowded room, narrow enough that no
// value locks everyone out, hangs a phone on the human check, or overflows the
// column that stores it (ADR 0031).
const bounds: Readonly<Record<SettingKey, Bounds>> = {
  'abuse.linkEmailsBeforeCheck': { min: 0, max: 100 },
  'abuse.linkEmailsCeiling': { min: 1, max: 1000 },
  'abuse.linkEmailWindowMinutes': { min: 1, max: MINUTES_PER_DAY },
  'abuse.authRequestsPerIp': { min: 1, max: 100_000 },
  'abuse.ipWindowMinutes': { min: 1, max: MINUTES_PER_DAY },
  'abuse.applicantsBeforeCheck': { min: 0, max: 10_000 },
  'abuse.applicantsCeiling': { min: 1, max: 100_000 },
  'abuse.applicantWindowMinutes': { min: 1, max: MINUTES_PER_DAY },
  'abuse.humanCheckCost': { min: 100, max: 20_000 },
  'abuse.humanCheckMinutes': { min: 1, max: 60 },
  'limits.inviteDefaultMaxUses': { min: 1, max: 100_000 },
  'limits.inviteDefaultHours': { min: 1, max: 720 },
  'limits.challengeMinChars': { min: 1, max: 300 },
  'limits.beenThereNoteMinChars': { min: 1, max: 300 },
}

// Each ceiling must stay at or above the free uses it caps.
const pairs: readonly (readonly [free: SettingKey, ceiling: SettingKey])[] = [
  ['abuse.linkEmailsBeforeCheck', 'abuse.linkEmailsCeiling'],
  ['abuse.applicantsBeforeCheck', 'abuse.applicantsCeiling'],
]

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(bounds, key)
}

/** The lowest and highest value a host may set for `key`. */
export function boundsOf(key: SettingKey): Bounds {
  return bounds[key]
}

function split(
  key: SettingKey,
): ['limits', LimitKey] | ['abuse', keyof AbuseLimits] {
  const [group, name] = key.split('.') as [string, string]
  return group === 'limits'
    ? ['limits', name as LimitKey]
    : ['abuse', name as keyof AbuseLimits]
}

/** The current value of `key`. */
export function valueOf(values: SettingValues, key: SettingKey): number {
  const [group, name] = split(key)
  return group === 'limits' ? values.limits[name] : values.abuse[name]
}

function withValue(
  values: SettingValues,
  key: SettingKey,
  value: number,
): SettingValues {
  const [group, name] = split(key)
  return group === 'limits'
    ? { ...values, limits: { ...values.limits, [name]: value } }
    : { ...values, abuse: { ...values.abuse, [name]: value } }
}

export type ChangeCheck = 'ok' | 'out_of_bounds' | 'out_of_order'

function inBounds(key: SettingKey, value: number): boolean {
  const { min, max } = bounds[key]
  return Number.isInteger(value) && value >= min && value <= max
}

function ordered(
  values: SettingValues,
  [free, ceiling]: readonly [SettingKey, SettingKey],
): boolean {
  return valueOf(values, free) <= valueOf(values, ceiling)
}

/** Whether every ceiling stays at or above its free uses once `key` is
 * `value`. */
export function keepsOrder(
  values: SettingValues,
  key: SettingKey,
  value: number,
): boolean {
  const next = withValue(values, key, value)
  return pairs.every((pair) => ordered(next, pair))
}

/** Whether `key` may take `value` given the other values in force: within its
 * bounds, and no ceiling below the free uses it caps. */
export function checkChange(
  values: SettingValues,
  key: SettingKey,
  value: number,
): ChangeCheck {
  if (!inBounds(key, value)) return 'out_of_bounds'
  return keepsOrder(values, key, value) ? 'ok' : 'out_of_order'
}

/** The deployment's values with the hosts' changes applied. A change no longer
 * allowed is skipped: one past bounds since narrowed, or a pair left out of
 * order by a new deployment value, which falls back to the deployment's pair. */
export function withOverrides(
  base: SettingValues,
  overrides: readonly { key: string; value: number }[],
): SettingValues {
  const applied = overrides.reduce<SettingValues>(
    (values, { key, value }) =>
      isSettingKey(key) && inBounds(key, value)
        ? withValue(values, key, value)
        : values,
    base,
  )
  return pairs.reduce<SettingValues>(
    (values, pair) =>
      ordered(values, pair)
        ? values
        : pair.reduce<SettingValues>(
            (reverted, key) => withValue(reverted, key, valueOf(base, key)),
            values,
          ),
    applied,
  )
}
