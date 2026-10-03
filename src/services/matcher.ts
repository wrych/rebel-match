/** A trend as the matcher sees it: its id and keywords (design §5). */
export interface TrendKeywords {
  id: string
  keywords: { strong: readonly string[]; weak: readonly string[] }
}

const STRONG_WEIGHT = 6
const WEAK_WEIGHT = 1

// The trend design §5 names for a challenge no keyword matches: Distributed
// Decision Making.
export const FALLBACK_TREND = '06'

function score(text: string, trend: TrendKeywords): number {
  const strong = trend.keywords.strong.filter((k) => text.includes(k)).length
  const weak = trend.keywords.weak.filter((k) => text.includes(k)).length
  return strong * STRONG_WEIGHT + weak * WEAK_WEIGHT
}

/** The prototype's keyword scorer (design §5, R-ASK-5): the highest-scoring
 * trend wins, the earlier one on a tie, and the fallback when nothing scores.
 * The member can always override it (R-ASK-6). */
export function detectTrend(
  text: string,
  trends: readonly TrendKeywords[],
): string {
  const lowered = text.toLowerCase()
  let best = FALLBACK_TREND
  let bestScore = 0
  for (const trend of trends) {
    const s = score(lowered, trend)
    if (s > bestScore) {
      best = trend.id
      bestScore = s
    }
  }
  return best
}
