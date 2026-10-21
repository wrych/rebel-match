import type {
  Challenge,
  Matches,
  NewestChallenge,
  PeerCard,
  Trend,
  TrendDetail,
} from '../../src/services/challenges'
import { ensureOk, findJson, getJson, jsonOf, outcomeOf, send } from './request'

export type {
  Challenge,
  Matches,
  NewestChallenge,
  PeerCard,
  Trend,
  TrendDetail,
}

export async function fetchTrends(): Promise<Trend[]> {
  const { trends } = await getJson<{ trends: Trend[] }>(
    '/api/trends',
    'trends unavailable',
  )
  return trends
}

/** Other members' newest challenges, in one trend when given, without who
 * wrote them (R-ASK-2, R-ASK-14). */
export async function fetchNewestChallenges(
  trendId?: string,
): Promise<NewestChallenge[]> {
  const query =
    trendId === undefined ? '' : `?trend=${encodeURIComponent(trendId)}`
  const { challenges } = await getJson<{ challenges: NewestChallenge[] }>(
    `/api/challenges/newest${query}`,
    'newest challenges unavailable',
  )
  return challenges
}

/** Saves the challenge and returns it with the trend the matcher picked
 * (R-ASK-4,5). */
export async function submitChallenge(body: string): Promise<Challenge> {
  const response = await send('/api/challenges', 'POST', { body })
  return (
    await jsonOf<{ challenge: Challenge }>(response, 'challenge not saved')
  ).challenge
}

/** The member's own challenge, or null when there is none for them under
 * that id (R-NAV-8). */
export async function fetchChallenge(id: string): Promise<Challenge | null> {
  const found = await findJson<{ challenge: Challenge }>(
    `/api/challenges/${encodeURIComponent(id)}`,
    'challenge unavailable',
  )
  return found?.challenge ?? null
}

/** Same boat, been there and case studies for the member's own challenge,
 * or null when there is none for them under that id (R-ASK-8, R-NAV-8). */
export async function fetchMatches(id: string): Promise<Matches | null> {
  return findJson<Matches>(
    `/api/challenges/${encodeURIComponent(id)}/matches`,
    'matches unavailable',
  )
}

/** One trend with its case studies, or null for an id that is no trend. */
export async function fetchTrendDetail(
  trendId: string,
): Promise<TrendDetail | null> {
  return findJson<TrendDetail>(
    `/api/trends/${encodeURIComponent(trendId)}`,
    'trend unavailable',
  )
}

/** Who a member is, as one line: job title, organization, sector and company
 * size, leaving out what they did not give. */
export function peerLine(
  peer: Pick<PeerCard, 'jobTitle' | 'org' | 'sector' | 'companySize'>,
): string {
  return [peer.jobTitle, peer.org, peer.sector, peer.companySize]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ')
}

export type MatchesSection = 'sameBoat' | 'beenThere' | 'cases'

/** What the control below a matches section offers in the cards layout: how
 * many more there are, named by what they are (R-ASK-15). */
export function moreMatches(section: MatchesSection, count: number): string {
  const one = count === 1
  if (section === 'sameBoat')
    return `${String(count)} more ${one ? 'rebel' : 'rebels'} in the same boat`
  if (section === 'beenThere') return `${String(count)} more who’ve been there`
  return `${String(count)} more ${one ? 'case study' : 'case studies'}`
}

const sectionVerb: Record<MatchesSection, [one: string, many: string]> = {
  sameBoat: ['is in the same boat', 'are in the same boat'],
  beenThere: ['has been there', 'have been there'],
  cases: ['made the shift', 'made the shift'],
}

/** One sentence over a matches section: the first `named` names, most
 * relevant first, and how many others there are (R-ASK-15). */
export function matchesSentence(
  section: MatchesSection,
  names: string[],
  named: number,
): string {
  const shown = names.slice(0, named)
  const others = names.length - shown.length
  const parts =
    others > 0
      ? [...shown, `${String(others)} ${others === 1 ? 'other' : 'others'}`]
      : shown
  const listed =
    parts.length === 1
      ? parts.join('')
      : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) ?? ''}`
  const [one, many] = sectionVerb[section]
  return `${listed} ${names.length === 1 ? one : many}.`
}

/** Stores the trend the member confirmed, picked or suggested (R-ASK-7). */
export async function confirmTrend(id: string, trendId: string): Promise<void> {
  const response = await send(
    `/api/challenges/${encodeURIComponent(id)}`,
    'PATCH',
    { trendId },
  )
  ensureOk(response, 'trend not saved')
}

/** Withdraws the member's own challenge for good (R-ASK-17); `gone` when it
 * is no longer theirs to withdraw. Throws on anything else. */
export async function withdrawChallenge(
  id: string,
): Promise<'withdrawn' | 'gone'> {
  const response = await send(
    `/api/challenges/${encodeURIComponent(id)}/withdraw`,
    'POST',
  )
  return outcomeOf<'withdrawn' | 'gone'>(response, 'challenge not withdrawn', {
    204: 'withdrawn',
    404: 'gone',
  })
}

/** The trend the domain screen shows: one picked on the trend screen, if it
 * is a real trend, else the confirmed one, else the matcher's (R-ASK-6). */
export function shownTrend(
  trends: readonly Trend[],
  challenge: Challenge,
  picked: string | null,
): Trend | null {
  const byId = (id: string | null): Trend | undefined =>
    trends.find((trend) => trend.id === id)
  return (
    byId(picked) ?? byId(challenge.trendId) ?? byId(challenge.autoTrend) ?? null
  )
}
