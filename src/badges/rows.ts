/** A row of badges: one thing counted (R-BADGE-1). */
export type CountedRow = 'speak' | 'help' | 'boat' | 'connect'

export const countedRows: readonly CountedRow[] = [
  'speak',
  'help',
  'boat',
  'connect',
]

/** What a row is called and what its levels and crown are named. */
export interface RowNames {
  title: string
  counts: readonly [one: string, many: string]
  levels: readonly string[]
  crown: string
}

/** The names members see, free of server dependencies so the client can
 * show them too (R-BADGE-1). */
export const rowNames: Readonly<Record<CountedRow, RowNames>> = {
  speak: {
    title: 'Speak up',
    counts: ['challenge', 'challenges'],
    levels: ['Spark', 'Agitator', 'Firebrand'],
    crown: 'Ringleader',
  },
  help: {
    title: 'Offer help',
    counts: ['offer', 'offers'],
    levels: ['Ally', 'Partner in Crime', 'Freedom Fighter'],
    crown: 'Liberator',
  },
  boat: {
    title: 'Shared pain',
    counts: ['same boat', 'same boats'],
    levels: ['Shipmate', 'Mutineer', 'Captain of the Mutiny'],
    crown: 'Admiral of the Fleet',
  },
  connect: {
    title: 'Connect',
    counts: ['person', 'people'],
    levels: ['Co-conspirator', 'Cell Builder', 'Movement Maker'],
    crown: 'Heart of the Movement',
  },
}

/** The levels, from 1, that a count has reached, given the count each level
 * is earned at (R-BADGE-1). */
export function levelsReached(
  count: number,
  levelCounts: readonly number[],
): number[] {
  return levelCounts
    .map((needed, index) => ({ needed, level: index + 1 }))
    .filter(({ needed }) => count >= needed)
    .map(({ level }) => level)
}
