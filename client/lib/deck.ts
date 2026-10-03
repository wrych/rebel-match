import type { DeckCard } from '../../src/services/deck'
import type { SwipeAction } from '../../src/services/swipes'

export type { DeckCard, SwipeAction }

/** What came of an answer to a card: recorded, with whether a connection
 * request is new or was already waiting; or gone, when the card is no
 * longer there to answer (R-OFF-3). */
export type SwipeResult =
  { result: 'recorded'; request?: 'created' | 'exists' } | { result: 'gone' }

/** The next cards to answer, never the member's own (R-OFF-1). */
export async function fetchDeck(): Promise<DeckCard[]> {
  const response = await fetch('/api/deck')
  if (!response.ok)
    throw new Error(`deck unavailable (${String(response.status)})`)
  return ((await response.json()) as { cards: DeckCard[] }).cards
}

/** Answers a card: same boat, been there (with its note), follow or skip. */
export async function answerCard(
  challengeId: string,
  action: SwipeAction,
  note?: string,
): Promise<SwipeResult> {
  const response = await fetch('/api/swipe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challengeId, action, note }),
  })
  if (response.status === 404) return { result: 'gone' }
  if (!response.ok)
    throw new Error(`answer not saved (${String(response.status)})`)
  const outcome = (await response.json()) as {
    connection?: { result: 'created' | 'exists' }
  }
  return outcome.connection === undefined
    ? { result: 'recorded' }
    : { result: 'recorded', request: outcome.connection.result }
}

/** Who wrote a card, as one line: name, then organization and sector. */
export function authorLine(card: DeckCard): string {
  return [card.author.org, card.author.sector]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ')
}
