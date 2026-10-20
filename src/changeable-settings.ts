import { changeableAbuse, type AbuseLimits } from './abuse.js'
import {
  experimentKeys,
  isExperimentKey,
  type ExperimentKey,
  type FlagSettings,
} from './experiments.js'
import {
  gameBounds,
  gameOrder,
  isGameKey,
  type GameKey,
  type GameSettings,
} from './game/tuning.js'
import {
  changeableLimits,
  type ChangeableLimitKey,
  type Limits,
} from './limits.js'
import type { Bounds } from './setting-specs.js'

/** A setting hosts may change in the app (R-CFG-6, ADR 0031). */
export type SettingKey =
  | `limits.${ChangeableLimitKey}`
  | `abuse.${keyof AbuseLimits}`
  | `game.${GameKey}`
  | `flags.${ExperimentKey}`

// A value a changeable setting is ordered against, though hosts cannot change it.
type OrderedKey = SettingKey | 'limits.challengeMaxChars'

/** The values the changeable settings live in. */
export interface SettingValues {
  limits: Limits
  abuse: AbuseLimits
  game: GameSettings
  flags: FlagSettings
}

// An experiment's share of members, from nobody to everyone (R-EXP-3).
const PERCENT_BOUNDS: Bounds = { min: 0, max: 100 }

const prefixed = <G extends string, K extends string>(
  group: G,
  of: Readonly<Record<K, Bounds>>,
): Record<`${G}.${K}`, Bounds> =>
  Object.fromEntries(
    Object.entries(of).map(([key, value]) => [`${group}.${key}`, value]),
  ) as Record<`${G}.${K}`, Bounds>

// What a host can set: wide enough for a crowded room, narrow enough that no
// value locks everyone out, hangs a phone on the human check, or overflows the
// column that stores it (ADR 0031).
const bounds: Readonly<Record<SettingKey, Bounds>> = {
  ...prefixed('abuse', changeableAbuse),
  ...prefixed('limits', changeableLimits),
  ...prefixed('game', gameBounds),
  ...(Object.fromEntries(
    experimentKeys.map((key) => [`flags.${key}`, PERCENT_BOUNDS]),
  ) as Record<`flags.${ExperimentKey}`, Bounds>),
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
  | ['limits', keyof Limits]
  | ['abuse', keyof AbuseLimits]
  | ['game', GameKey]
  | ['flags', ExperimentKey]

function split(key: OrderedKey): Located {
  const dot = key.indexOf('.')
  const group = key.slice(0, dot)
  const name = key.slice(dot + 1)
  if (group === 'game' && isGameKey(name)) return ['game', name]
  if (group === 'flags' && isExperimentKey(name)) return ['flags', name]
  return group === 'limits'
    ? ['limits', name as keyof Limits]
    : ['abuse', name as keyof AbuseLimits]
}

/** The current value of `key`. */
export function valueOf(values: SettingValues, key: OrderedKey): number {
  const [group, name] = split(key)
  if (group === 'game') return values.game[name]
  if (group === 'flags') return values.flags[name]
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
  if (group === 'flags')
    return { ...values, flags: { ...values.flags, [name]: value } }
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
