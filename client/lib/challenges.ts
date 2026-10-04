import { companySizeLabel } from '../../src/profile-options'
import type {
  Challenge,
  Matches,
  PeerCard,
  Trend,
  TrendDetail,
} from '../../src/services/challenges'

export type { Challenge, Matches, PeerCard, Trend, TrendDetail }

/** Hints of what belongs in a challenge, taken from the prototype. They are
 * shown as text only, never inserted into the member's own words (R-ASK-2). */
export const challengeExamples: readonly string[] = [
  'Nobody knows who can decide what.',
  'Roles and circles, old salary model.',
  'Peer feedback instead of annual reviews.',
  'A shadow organisation beside the official one.',
]

export async function fetchTrends(): Promise<Trend[]> {
  const response = await fetch('/api/trends')
  if (!response.ok)
    throw new Error(`trends unavailable (${String(response.status)})`)
  return ((await response.json()) as { trends: Trend[] }).trends
}

/** Saves the challenge and returns it with the trend the matcher picked
 * (R-ASK-4,5). */
export async function submitChallenge(body: string): Promise<Challenge> {
  const response = await fetch('/api/challenges', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok)
    throw new Error(`challenge not saved (${String(response.status)})`)
  return ((await response.json()) as { challenge: Challenge }).challenge
}

/** The member's own challenge, or null when there is none for them under
 * that id (R-NAV-8). */
export async function fetchChallenge(id: string): Promise<Challenge | null> {
  const response = await fetch(`/api/challenges/${encodeURIComponent(id)}`)
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(`challenge unavailable (${String(response.status)})`)
  return ((await response.json()) as { challenge: Challenge }).challenge
}

/** Same boat, been there and case studies for the member's own challenge,
 * or null when there is none for them under that id (R-ASK-8, R-NAV-8). */
export async function fetchMatches(id: string): Promise<Matches | null> {
  const response = await fetch(
    `/api/challenges/${encodeURIComponent(id)}/matches`,
  )
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(`matches unavailable (${String(response.status)})`)
  return (await response.json()) as Matches
}

/** One trend with its case studies, or null for an id that is no trend. */
export async function fetchTrendDetail(
  trendId: string,
): Promise<TrendDetail | null> {
  const response = await fetch(`/api/trends/${encodeURIComponent(trendId)}`)
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(`trend unavailable (${String(response.status)})`)
  return (await response.json()) as TrendDetail
}

/** Who a member is, as one line: job title, organization, sector and company
 * size, leaving out what they did not give. */
export function peerLine(
  peer: Pick<PeerCard, 'jobTitle' | 'org' | 'sector' | 'companySize'>,
): string {
  return [
    peer.jobTitle,
    peer.org,
    peer.sector,
    companySizeLabel(peer.companySize),
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ')
}

/** Stores the trend the member confirmed, picked or suggested (R-ASK-7). */
export async function confirmTrend(id: string, trendId: string): Promise<void> {
  const response = await fetch(`/api/challenges/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trendId }),
  })
  if (!response.ok)
    throw new Error(`trend not saved (${String(response.status)})`)
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
