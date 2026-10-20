import { firstDaysUpTo, FIRST_REBEL_LEVEL } from '../game/levels.js'

export const countedRows = ['speak', 'help', 'boat', 'connect'] as const

/** A row counted from what members do, its levels at configured counts
 * (R-BADGE-1). */
export type CountedRow = (typeof countedRows)[number]

/** Every row of badges: the counted ones and the game's promotions. */
export const badgeRows = [...countedRows, 'game'] as const

export type BadgeRow = (typeof badgeRows)[number]

/** The game's promotions are reached on the first day of each job, so its
 * levels sit at those levels, fixed by the game (R-BADGE-1, R-GAME-16). */
export const promotionLevels: readonly number[] =
  firstDaysUpTo(FIRST_REBEL_LEVEL)

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
export const rowNames: Readonly<Record<BadgeRow, RowNames>> = {
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
  // A teaser: its screen names the jobs and nothing of where they come
  // from, so it has no words for counting (R-BADGE-9).
  game: {
    title: 'Promotions',
    counts: ['', ''],
    explains: '',
    levels: ['Team Lead', 'Manager', 'Director', 'VP', 'CEO', 'Rebel'],
    crown: 'Leader of the Revolution',
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

/** Where event badges are marked seen and notified, beside the rows
 * (R-BADGE-6, R-BADGE-10). */
export const eventRow = 'event'

/** What the event badges are called beside the rows' titles. */
export const eventTitle = 'Events'

/** A row of badges, or the event badges, as the member opens them. */
export type SeenRow = BadgeRow | typeof eventRow

export const seenRows = [...badgeRows, eventRow] as const
