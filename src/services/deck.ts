/** A card in the swipe deck: the challenge, its trend, and who wrote it
 * (R-OFF-2). Never how to reach them (R-CONN-6). */
export interface DeckCard {
  challengeId: string
  body: string
  trend: { id: string; short: string }
  author: {
    name: string
    jobTitle: string | null
    org: string | null
    sector: string | null
  }
}

export interface DeckStore {
  /** Active challenges by other active, onboarded members that `viewerId`
   * has not swiped, newest first, at most `limit`. */
  nextFor(viewerId: string, limit: number): Promise<DeckCard[]>
}

export interface DeckService {
  next(viewerId: string): Promise<DeckCard[]>
}

/** F6's deck: others' challenges, never the viewer's own and never one they
 * already swiped (R-OFF-1, R-OFF-2), a page at a time. */
export function createDeck(deps: {
  store: DeckStore
  pageSize: number
}): DeckService {
  return {
    next: (viewerId) => deps.store.nextFor(viewerId, deps.pageSize),
  }
}
