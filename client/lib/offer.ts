import type { DeckCard, SwipeResult } from './deck'

/** What to tell the member after answering a card, or nothing for a skip. */
export function noticeFor(
  card: DeckCard,
  action: 'same_boat' | 'follow' | 'skip',
  result: SwipeResult,
): string | null {
  const first = card.author.name.split(' ')[0] ?? card.author.name
  if (result.result === 'gone') return 'That challenge is no longer open.'
  if (action === 'follow') return `Following “${card.trend.short}”.`
  if (action === 'skip') return null
  return result.request === 'exists'
    ? `You already asked ${first}; they have not answered yet.`
    : `We let ${first} know you are in the same boat. Nothing is shared until they accept.`
}
