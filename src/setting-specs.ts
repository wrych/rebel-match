import { z } from 'zod'

/** The lowest and highest value a host may set for a changeable setting. */
export interface Bounds {
  min: number
  max: number
}

/** A unit as it reads after one and after many. */
export type Unit = readonly [one: string, many: string]

export const MINUTES: Unit = ['minute', 'minutes']
export const HOURS: Unit = ['hour', 'hours']
export const DAYS: Unit = ['day', 'days']
export const SECONDS: Unit = ['second', 'seconds']
export const CHARACTERS: Unit = ['character', 'characters']
export const PERCENT: Unit = ['percent', 'percent']
export const PIXELS: Unit = ['pixel', 'pixels']

/** How the host tools name and explain a setting (R-CFG-5). */
export interface Shown {
  name: string
  explanation: string
  unit?: Unit
  /** An on/off switch storing 1 or 0, shown as On or Off. */
  switch?: true
  /** A moment, in whole minutes since 1970 in UTC, 0 for none. */
  moment?: true
  /** The value as hosts read it, when it is kept in another measure. */
  as?: (value: number) => string | number
}

interface Tunable {
  /** The environment variable a deployment sets it with. */
  env: string
  default: number
  /** Zero is allowed; otherwise the value must be positive. */
  zeroAllowed?: true
  /** Changeable in the app, within these bounds (R-CFG-6, ADR 0031). */
  changeable?: Bounds
  shown?: Shown
}

interface Fixed {
  /** Fixed in code: no deployment can change it. */
  fixed: number
  shown?: Shown
}

/** A group of numeric settings, each declared once: set by an environment
 * variable with a default, or fixed in code. */
export type Specs = Readonly<Record<string, Tunable | Fixed>>

type EnvNumber = z.ZodDefault<z.ZodCoercedNumber>

type EnvName<S extends Specs, K extends keyof S> = S[K] extends {
  env: infer E extends string
}
  ? E
  : never

/** The environment schema entries a group's tunable settings are read by. */
export type EnvOf<S extends Specs> = {
  [K in keyof S as EnvName<S, K>]: EnvNumber
}

/** A group's values, by setting name. */
export type ValuesOf<S extends Specs> = Record<keyof S, number>

/** The settings in a group hosts may change in the app (R-CFG-6). */
export type ChangeableKey<S extends Specs> = {
  [K in keyof S]: S[K] extends { changeable: Bounds } ? K : never
}[keyof S]

/** The settings in a group the host tools show as their spec describes. */
export type ShownKey<S extends Specs> = {
  [K in keyof S]: S[K] extends { shown: Shown } ? K : never
}[keyof S]

/** A setting as its spec describes it to hosts, and whether code fixes it. */
export interface ShownSpec extends Shown {
  fixed: boolean
}

const entriesOf = (specs: Specs): [string, Tunable | Fixed][] =>
  Object.entries(specs)

function envNumber(spec: Tunable): EnvNumber {
  const whole = z.coerce.number().int()
  return (spec.zeroAllowed ? whole.nonnegative() : whole.positive()).default(
    spec.default,
  )
}

/** The environment schema entries for a group: each tunable setting a whole
 * number with its default (R-CFG-1). */
export function envOf<S extends Specs>(specs: S): EnvOf<S> {
  return Object.fromEntries(
    entriesOf(specs).flatMap(([, spec]) =>
      'env' in spec ? [[spec.env, envNumber(spec)]] : [],
    ),
  ) as EnvOf<S>
}

/** A group's values as a deployment's parsed environment sets them. */
export function valuesFrom<S extends Specs>(
  specs: S,
  env: { readonly [E in keyof EnvOf<S>]: number },
): ValuesOf<S> {
  const values = env as Readonly<Record<string, number>>
  return Object.fromEntries(
    entriesOf(specs).map(([key, spec]) => [
      key,
      'fixed' in spec ? spec.fixed : (values[spec.env] ?? spec.default),
    ]),
  ) as ValuesOf<S>
}

/** The bounds of each setting in a group hosts may change (ADR 0031). */
export function changeableOf<S extends Specs>(
  specs: S,
): Readonly<Record<ChangeableKey<S>, Bounds>> {
  return Object.fromEntries(
    entriesOf(specs).flatMap(([key, spec]) =>
      'changeable' in spec ? [[key, spec.changeable]] : [],
    ),
  ) as Record<ChangeableKey<S>, Bounds>
}

/** How the host tools show each setting in a group that describes itself
 * (R-CFG-5). */
export function shownOf<S extends Specs>(
  specs: S,
): Readonly<Record<ShownKey<S>, ShownSpec>> {
  return Object.fromEntries(
    entriesOf(specs).flatMap(([key, spec]) =>
      spec.shown === undefined
        ? []
        : [[key, { ...spec.shown, fixed: 'fixed' in spec }]],
    ),
  ) as Record<ShownKey<S>, ShownSpec>
}

/** A group's entries keyed as `group.key`, the way settings are named across
 * groups. */
export const prefixed = <G extends string, K extends string, T>(
  group: G,
  of: Readonly<Record<K, T>>,
): Record<`${G}.${K}`, T> =>
  Object.fromEntries(
    Object.entries(of).map(([key, value]) => [`${group}.${key}`, value]),
  ) as Record<`${G}.${K}`, T>
