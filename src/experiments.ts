/** The experiments in code, each a control and one treatment; a key not listed
 * here cannot be stored, assigned or reported (R-EXP-1, ADR 0052). */
export const experiments = {
  /** The two layouts of a challenge's matches (R-ASK-15, R-ASK-16). */
  matches_layout: ['cards', 'summary'],
} as const

export type ExperimentKey = keyof typeof experiments
export type Variant<K extends ExperimentKey> = (typeof experiments)[K][number]

/** Each experiment's variant for one member. */
export type Assigned = { [K in ExperimentKey]: Variant<K> }

/** The percentage of members each experiment shows its treatment to. */
export type FlagSettings = Record<ExperimentKey, number>

export const experimentKeys = Object.keys(experiments) as ExperimentKey[]

export function isExperimentKey(key: string): key is ExperimentKey {
  return Object.hasOwn(experiments, key)
}
