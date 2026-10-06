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
    /** Labels, as a card shows them, not the stored keys. */
    sector: string | null
    companySize: string | null
  }
}

export interface DeckStore {
  /** Active challenges by other active, onboarded members that `viewerId`
   * has not swiped, newest first, at most `limit`; `first` leads when it is
   * among them (R-OFF-7). */
  nextFor(viewerId: string, limit: number, first?: string): Promise<DeckCard[]>
}

export interface DeckService {
  /** With `first`, the deck opens at that card when it would be in it at all,
   * and as usual otherwise, revealing nothing (R-OFF-7, R-NAV-8). */
  next(viewerId: string, first?: string): Promise<DeckCard[]>
}

/** F6's deck: others' challenges, never the viewer's own and never one they
 * already swiped (R-OFF-1, R-OFF-2), a page at a time. */
export function createDeck(deps: {
  store: DeckStore
  pageSize: number
}): DeckService {
  return {
    next: (viewerId, first) =>
      deps.store.nextFor(viewerId, deps.pageSize, first),
  }
}
