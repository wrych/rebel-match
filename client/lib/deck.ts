import type { DeckCard } from '../../src/services/deck'
import type { SwipeAction } from '../../src/services/swipes'
import { getJson, jsonOf, send } from './request'

export type { DeckCard, SwipeAction }

/** What came of an answer to a card: recorded, with whether a connection
 * request is new or was already waiting; joined, with the request, when its
 * author is already a connection (R-CONN-8); or gone, when the card is no
 * longer there to answer (R-OFF-3). */
export type SwipeResult =
  | { result: 'recorded'; request?: 'created' | 'exists' }
  | { result: 'joined'; id: string }
  | { result: 'gone' }

/** The next cards to answer, never the member's own (R-OFF-1); with
 * `first`, opened at that card when it is among them (R-OFF-7). */
export async function fetchDeck(first?: string): Promise<DeckCard[]> {
  const query = first === undefined ? '' : `?first=${encodeURIComponent(first)}`
  const { cards } = await getJson<{ cards: DeckCard[] }>(
    `/api/deck${query}`,
    'deck unavailable',
  )
  return cards
}

/** Answers a card: same boat, been there (with its note), follow or skip. */
export async function answerCard(
  challengeId: string,
  action: SwipeAction,
  note?: string,
): Promise<SwipeResult> {
  const response = await send('/api/swipe', 'POST', {
    challengeId,
    action,
    note,
  })
  if (response.status === 404) return { result: 'gone' }
  const { connection } = await jsonOf<{
    connection?: { result: 'created' | 'exists' | 'joined'; id: string }
  }>(response, 'answer not saved')
  if (connection === undefined) return { result: 'recorded' }
  return connection.result === 'joined'
    ? { result: 'joined', id: connection.id }
    : { result: 'recorded', request: connection.result }
}

/** Tells the server a card became the visible one (R-STAT-1). Fire and
 * forget: a view that fails to record never stops the deck. */
export function reportSeen(challengeId: string): void {
  void send('/api/deck/seen', 'POST', { challengeId }).catch(() => undefined)
}

/** Who wrote a card, as one line: organization, sector and company size. */
export function authorLine(card: DeckCard): string {
  return [card.author.org, card.author.sector, card.author.companySize]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ')
}
