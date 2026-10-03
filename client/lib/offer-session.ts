/** What a member did in the deck during this browser session, for the
 * empty-deck summary (R-OFF-5). Kept in sessionStorage, so it starts again
 * with the next visit; a browser that refuses storage simply counts zero. */
export interface OfferTally {
  sameBoat: number
  beenThere: number
  follows: number
}

const KEY = 'rm_offer_tally'
const empty: OfferTally = { sameBoat: 0, beenThere: 0, follows: 0 }

export function readTally(): OfferTally {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as unknown
    if (saved === null || typeof saved !== 'object') return { ...empty }
    const tally = saved as Partial<Record<keyof OfferTally, unknown>>
    const count = (value: unknown): number =>
      typeof value === 'number' && Number.isInteger(value) && value > 0
        ? value
        : 0
    return {
      sameBoat: count(tally.sameBoat),
      beenThere: count(tally.beenThere),
      follows: count(tally.follows),
    }
  } catch {
    return { ...empty }
  }
}

export function countAnswer(kind: keyof OfferTally): void {
  const tally = readTally()
  tally[kind] += 1
  try {
    sessionStorage.setItem(KEY, JSON.stringify(tally))
  } catch {
    // Without storage the summary reads zero; nothing else depends on it.
  }
}

/** The summary line, as the prototype words it. */
export function tallyLine(tally: OfferTally): string {
  const plural = (n: number, one: string, many: string): string =>
    `${String(n)} ${n === 1 ? one : many}`
  return [
    plural(tally.sameBoat, 'same-boat match', 'same-boat matches'),
    plural(tally.beenThere, 'offer sent', 'offers sent'),
    plural(tally.follows, 'topic followed', 'topics followed'),
  ].join(' · ')
}
