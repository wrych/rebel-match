import type { AbuseLimits, Limits } from './config.js'
import {
  gameBounds,
  gameOrder,
  isGameKey,
  type GameKey,
  type GameSettings,
} from './game/tuning.js'

type LimitKey =
  | 'challengeMinChars'
  | 'beenThereNoteMinChars'
  | 'inviteDefaultMaxUses'
  | 'inviteDefaultHours'

/** A setting hosts may change in the app (R-CFG-6, ADR 0031). */
export type SettingKey =
  `limits.${LimitKey}` | `abuse.${keyof AbuseLimits}` | `game.${GameKey}`

// A value a changeable setting is ordered against, though hosts cannot change it.
type OrderedKey = SettingKey | 'limits.challengeMaxChars'

/** The values the changeable settings live in. */
export interface SettingValues {
  limits: Limits
  abuse: AbuseLimits
  game: GameSettings
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
  ...(Object.fromEntries(
    Object.entries(gameBounds).map(([key, value]) => [`game.${key}`, value]),
  ) as Record<`game.${GameKey}`, Bounds>),
}

// Each ceiling must stay at or above the floor beneath it.
const pairs: readonly (readonly [floor: OrderedKey, ceiling: OrderedKey])[] = [
  ['abuse.linkEmailsBeforeCheck', 'abuse.linkEmailsCeiling'],
  ['abuse.applicantsBeforeCheck', 'abuse.applicantsCeiling'],
  ['limits.challengeMinChars', 'limits.challengeMaxChars'],
  ...gameOrder.map(
    ([floor, ceiling]) => [`game.${floor}`, `game.${ceiling}`] as const,
  ),
]

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(bounds, key)
}

/** The lowest and highest value a host may set for `key`. */
export function boundsOf(key: SettingKey): Bounds {
  return bounds[key]
}

type Located =
  ['limits', keyof Limits] | ['abuse', keyof AbuseLimits] | ['game', GameKey]

function split(key: OrderedKey): Located {
  const dot = key.indexOf('.')
  const group = key.slice(0, dot)
  const name = key.slice(dot + 1)
  if (group === 'game' && isGameKey(name)) return ['game', name]
  return group === 'limits'
    ? ['limits', name as keyof Limits]
    : ['abuse', name as keyof AbuseLimits]
}

/** The current value of `key`. */
export function valueOf(values: SettingValues, key: OrderedKey): number {
  const [group, name] = split(key)
  if (group === 'game') return values.game[name]
  return group === 'limits' ? values.limits[name] : values.abuse[name]
}

function withValue(
  values: SettingValues,
  key: OrderedKey,
  value: number,
): SettingValues {
  const [group, name] = split(key)
  if (group === 'game')
    return { ...values, game: { ...values.game, [name]: value } }
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
  [floor, ceiling]: readonly [OrderedKey, OrderedKey],
): boolean {
  return valueOf(values, floor) <= valueOf(values, ceiling)
}

/** Whether every ceiling stays at or above its floor once `key` is
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
 * bounds, and no ceiling below its floor. */
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
