export const countedRows = ['speak', 'help', 'boat', 'connect'] as const

/** A row of badges: one thing counted (R-BADGE-1). */
export type CountedRow = (typeof countedRows)[number]

/** What a row is called and what its levels and crown are named. */
export interface RowNames {
  title: string
  counts: readonly [one: string, many: string]
  /** How the row counts, as its screen says it (R-BADGE-8). */
  explains: string
  levels: readonly string[]
  crown: string
}

/** The names members see, free of server dependencies so the client can
 * show them too (R-BADGE-1). */
export const rowNames: Readonly<Record<CountedRow, RowNames>> = {
  speak: {
    title: 'Speak up',
    counts: ['challenge posted', 'challenges posted'],
    explains:
      'Each challenge you post counts once its topic is set. Taking one down later does not take a badge back.',
    levels: ['Spark', 'Agitator', 'Firebrand'],
    crown: 'Ringleader',
  },
  help: {
    title: 'Offer help',
    counts: ['offer of help', 'offers of help'],
    explains:
      'Each “Been there” you send from the deck, with your note, counts once.',
    levels: ['Ally', 'Partner in Crime', 'Freedom Fighter'],
    crown: 'Liberator',
  },
  boat: {
    title: 'Shared pain',
    counts: ['time in the same boat', 'times in the same boat'],
    explains:
      'Each time you tell someone you are in the same boat counts once, from the deck or from your matches.',
    levels: ['Shipmate', 'Mutineer', 'Captain of the Mutiny'],
    crown: 'Admiral of the Fleet',
  },
  connect: {
    title: 'Connect',
    counts: ['person connected', 'people connected'],
    explains:
      'Each person you are connected with counts once, however many challenges you share.',
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
