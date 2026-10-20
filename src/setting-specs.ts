import { z } from 'zod'

/** The lowest and highest value a host may set for a changeable setting. */
export interface Bounds {
  min: number
  max: number
}

interface Tunable {
  /** The environment variable a deployment sets it with. */
  env: string
  default: number
  /** Zero is allowed; otherwise the value must be positive. */
  zeroAllowed?: true
  /** Changeable in the app, within these bounds (R-CFG-6, ADR 0031). */
  changeable?: Bounds
}

interface Fixed {
  /** Fixed in code: no deployment can change it. */
  fixed: number
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
