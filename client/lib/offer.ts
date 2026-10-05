import type { DeckCard, SwipeResult } from './deck'

/** What to tell the member after answering a card, or nothing for a skip.
 * The next card is already showing when this does, so it names the answered
 * card's author in full and says which card it means (R-OFF-3). */
export function noticeFor(
  card: DeckCard,
  action: 'same_boat' | 'follow' | 'skip',
  result: SwipeResult,
): string | null {
  const name = card.author.name
  if (result.result === 'gone') return 'That challenge is no longer open.'
  if (action === 'follow') return `Following “${card.trend.short}”.`
  if (action === 'skip') return null
  return result.request === 'exists'
    ? `You already asked ${name} about the challenge you just answered; they have not answered yet.`
    : `We let ${name} know you are in the same boat on the challenge you just answered. Nothing is shared until they accept.`
}
