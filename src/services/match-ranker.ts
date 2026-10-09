import type { Challenge, PeerCard } from './challenges.js'

/** A peer as the store finds it: the card, plus when they entered the trend
 * (their challenge, or their been-there offer), for ranking only. */
export interface RankablePeer extends PeerCard {
  since: Date
}

export type MatchSection = 'sameBoat' | 'beenThere'

/** Orders one section's peers most relevant first for `challenge`, and returns
 * cards without `since` (R-ASK-8, ADR 0048). */
export type MatchRanker = (
  section: MatchSection,
  peers: RankablePeer[],
  challenge: Challenge,
) => PeerCard[]

function newerFirst(a: RankablePeer, b: RankablePeer): number {
  return (
    b.since.getTime() - a.since.getTime() ||
    a.name.localeCompare(b.name) ||
    a.memberId.localeCompare(b.memberId)
  )
}

function cardOf({ since: _since, ...card }: RankablePeer): PeerCard {
  return card
}

/** The beta's ranking: the latest challenge or offer first, then by name. */
export const newestFirst: MatchRanker = (_section, peers) =>
  [...peers].sort(newerFirst).map(cardOf)
