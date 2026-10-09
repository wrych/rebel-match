import { trackNothing, type Track } from './analytics.js'
import type { MatchRanker, RankablePeer } from './match-ranker.js'
import { detectTrend, type TrendKeywords } from './matcher.js'

/** A trend as screens show it (R-ASK-6). */
export interface Trend {
  id: string
  short: string
  from: string
  peers: number
}

export interface StoredTrend extends Trend, TrendKeywords {}

export interface Challenge {
  id: string
  memberId: string
  body: string
  trendId: string | null
  autoTrend: string | null
  overridden: boolean
  createdAt: string
}

/** A peer on the matches screen: who they are and what they bring, never how
 * to reach them (R-ASK-8, R-CONN-6). */
export interface PeerCard {
  memberId: string
  name: string
  jobTitle: string | null
  org: string | null
  /** Labels, as a card shows them, not the stored keys. */
  sector: string | null
  companySize: string | null
  note: string
}

export interface CaseStudy {
  org: string
  url: string
  takeaway: string
}

/** A trend on its own screen: what it moves from, and the curated cases
 * (design S9, R-ASK-8). Reveals no member at all. */
export interface TrendDetail {
  trend: Trend
  cases: CaseStudy[]
}

/** Someone else's challenge as inspiration: its words and trend, never who
 * wrote it (R-ASK-2, R-ASK-14). */
export interface NewestChallenge {
  body: string
  trend: Pick<Trend, 'id' | 'short'>
}

export interface Matches {
  trend: Trend
  sameBoat: PeerCard[]
  beenThere: PeerCard[]
  cases: CaseStudy[]
}

export interface ChallengeStore {
  trends(): Promise<StoredTrend[]>
  insert(challenge: {
    id: string
    memberId: string
    body: string
    autoTrend: string
  }): Promise<void>
  find(id: string): Promise<Challenge | null>
  setTrend(id: string, trendId: string, overridden: boolean): Promise<void>
  /** Other members with an active challenge in the trend, and members who
   * offer experience in it, in no order; never `viewerId` (R-ASK-8). */
  peers(
    trendId: string,
    viewerId: string,
  ): Promise<{ sameBoat: RankablePeer[]; beenThere: RankablePeer[] }>
  cases(trendId: string): Promise<CaseStudy[]>
  /** The newest active challenges of other active, onboarded members, in
   * `trendId` when it is given; never `viewerId`'s own (R-ASK-14). */
  newest(
    viewerId: string,
    trendId: string | null,
    limit: number,
  ): Promise<NewestChallenge[]>
}

export type ConfirmOutcome = 'saved' | 'not_found' | 'unknown_trend'

export interface ChallengeService {
  trends(): Promise<Trend[]>
  create(
    memberId: string,
    body: string,
    newId: () => string,
  ): Promise<Challenge>
  get(memberId: string, id: string): Promise<Challenge | null>
  confirmTrend(
    memberId: string,
    id: string,
    trendId: string,
  ): Promise<ConfirmOutcome>
  matches(memberId: string, id: string): Promise<Matches | null>
  trend(trendId: string): Promise<TrendDetail | null>
  newest(viewerId: string, trendId: string | null): Promise<NewestChallenge[]>
}

function shown(trend: StoredTrend): Trend {
  return {
    id: trend.id,
    short: trend.short,
    from: trend.from,
    peers: trend.peers,
  }
}

async function matchesFor(
  { store, rank }: Pick<ChallengeDeps, 'store' | 'rank'>,
  challenge: Challenge,
  memberId: string,
): Promise<Matches | null> {
  const trendId = challenge.trendId ?? challenge.autoTrend
  if (trendId === null) return null
  const trend = (await store.trends()).find((t) => t.id === trendId)
  if (trend === undefined) return null
  const [peers, cases] = await Promise.all([
    store.peers(trendId, memberId),
    store.cases(trendId),
  ])
  return {
    trend: shown(trend),
    sameBoat: rank('sameBoat', peers.sameBoat, challenge),
    beenThere: rank('beenThere', peers.beenThere, challenge),
    cases,
  }
}

async function trendDetail(
  store: ChallengeStore,
  trendId: string,
): Promise<TrendDetail | null> {
  const trend = (await store.trends()).find((t) => t.id === trendId)
  if (trend === undefined) return null
  return { trend: shown(trend), cases: await store.cases(trendId) }
}

interface ChallengeDeps {
  store: ChallengeStore
  rank: MatchRanker
  newestShown: number
  track?: Track
}

/** The Ask journey (F5): a challenge is written, matched to a trend
 * (R-ASK-4,5), confirmed or overridden (R-ASK-6,7), and shown its matches
 * (R-ASK-8). Only the author sees their challenge here: anyone else gets
 * nothing, as for a challenge that does not exist (R-NAV-8). */
export function createChallenges(deps: ChallengeDeps): ChallengeService {
  const track = deps.track ?? trackNothing
  const own = async (
    memberId: string,
    id: string,
  ): Promise<Challenge | null> => {
    const challenge = await deps.store.find(id)
    return challenge?.memberId === memberId ? challenge : null
  }

  return {
    trends: async () => (await deps.store.trends()).map(shown),
    create: async (memberId, body, newId) => {
      const autoTrend = detectTrend(body, await deps.store.trends())
      const id = newId()
      await deps.store.insert({ id, memberId, body, autoTrend })
      const created = await deps.store.find(id)
      if (created === null) throw new Error('challenge vanished after insert')
      void track(memberId, {
        name: 'challenge_submitted',
        char_count: body.length,
      })
      return created
    },
    get: own,
    confirmTrend: async (memberId, id, trendId) => {
      const challenge = await own(memberId, id)
      if (challenge === null) return 'not_found'
      const known = (await deps.store.trends()).some((t) => t.id === trendId)
      if (!known) return 'unknown_trend'
      const overridden = trendId !== challenge.autoTrend
      await deps.store.setTrend(id, trendId, overridden)
      void track(memberId, {
        name: 'trend_assigned',
        trend_id: trendId,
        overridden,
      })
      return 'saved'
    },
    matches: async (memberId, id) => {
      const challenge = await own(memberId, id)
      return challenge === null ? null : matchesFor(deps, challenge, memberId)
    },
    trend: (trendId) => trendDetail(deps.store, trendId),
    newest: (viewerId, trendId) =>
      deps.store.newest(viewerId, trendId, deps.newestShown),
  }
}
