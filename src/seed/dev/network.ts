import type {
  SeedChallenge,
  SeedConnection,
  SeedExpertise,
  SeedMember,
} from '../types.js'

const HOURS_PER_DAY = 24

/** The shape of the dev network over time (R-SEED-10): a trickle of joins
 * over weeks, one event's crowd in a few hours, a few since. */
export const networkShape = {
  firstJoinDaysAgo: 45,
  trickleEndsDaysAgo: 4,
  eventDaysAgo: 3,
  eventHours: 6,
  trickleShare: 0.55,
  eventShare: 0.35,
  sameBoatPerChallenge: 2,
  beenTherePerChallenge: 2,
  requestChance: 0.8,
  acceptedShare: 0.7,
  pendingShare: 0.18,
  maxAnswerHours: 48,
  maxPostDelayHours: 72,
  earliestAnswerHoursAgo: 0.5,
  seed: 1108,
}

type Shape = typeof networkShape

// A small seeded generator, so every dev database holds the same network
// (mulberry32).
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (random: () => number, low: number, high: number): number =>
  low + random() * (high - low)

function joinHoursAgo(
  rank: number,
  count: number,
  shape: Shape,
  random: () => number,
): number {
  const share = rank / Math.max(count - 1, 1)
  const day = HOURS_PER_DAY
  if (rank === 0) return shape.firstJoinDaysAgo * day
  if (share < shape.trickleShare)
    return between(
      random,
      shape.trickleEndsDaysAgo * day,
      shape.firstJoinDaysAgo * day,
    )
  const eventStart = shape.eventDaysAgo * day
  if (share < shape.trickleShare + shape.eventShare)
    return between(random, eventStart - shape.eventHours, eventStart)
  return between(random, 1, eventStart - shape.eventHours)
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j] as T, copy[i] as T]
  }
  return copy
}

/** When each member joined: the first listed earliest, the rest spread over
 * the shape in a seeded order (R-SEED-10). */
export function withJoinTimes(
  members: readonly SeedMember[],
  shape: Shape = networkShape,
): SeedMember[] {
  const random = seeded(shape.seed)
  const [first, ...rest] = members
  const order = first === undefined ? [] : [first, ...shuffled(rest, random)]
  const hours = new Map(
    order.map((member, rank) => [
      member.email,
      joinHoursAgo(rank, order.length, shape, random),
    ]),
  )
  return members.map((member) => ({
    ...member,
    joinedHoursAgo: hours.get(member.email) ?? 0,
  }))
}

/** When each challenge was posted: some time after its author joined, the
 * first within days, so challenges arrive with the crowd (R-SEED-10). */
export function withPostTimes(
  challenges: readonly SeedChallenge[],
  members: readonly SeedMember[],
  shape: Shape = networkShape,
): SeedChallenge[] {
  const random = seeded(shape.seed + 2)
  const joined = new Map(
    members.map((member) => [member.email, member.joinedHoursAgo ?? 0]),
  )
  return challenges.map((challenge) => {
    const since = joined.get(challenge.authorEmail) ?? 0
    const wait = Math.min(
      random() * shape.maxPostDelayHours,
      since - shape.earliestAnswerHoursAgo,
    )
    return { ...challenge, postedHoursAgo: Math.max(since - wait, 0) }
  })
}

interface Ask {
  from: string
  kind: SeedConnection['kind']
  challenge: SeedChallenge
}

function asksFor(
  challenge: SeedChallenge,
  challenges: readonly SeedChallenge[],
  expertise: readonly SeedExpertise[],
  shape: Shape,
  random: () => number,
): Ask[] {
  const others = (emails: string[]): string[] =>
    shuffled([...new Set(emails)], random).filter(
      (email) => email !== challenge.authorEmail,
    )
  const sameBoat = others(
    challenges
      .filter((other) => other.trendId === challenge.trendId)
      .map((other) => other.authorEmail),
  ).slice(0, shape.sameBoatPerChallenge)
  const beenThere = others(
    expertise
      .filter((offer) => offer.trendId === challenge.trendId)
      .map((offer) => offer.email),
  ).slice(0, shape.beenTherePerChallenge)
  return [
    ...sameBoat.map((from) => ({
      from,
      kind: 'same_boat' as const,
      challenge,
    })),
    ...beenThere.map((from) => ({
      from,
      kind: 'been_there' as const,
      challenge,
    })),
  ]
}

function statusOf(
  random: () => number,
  shape: Shape,
): SeedConnection['status'] {
  const roll = random()
  if (roll < shape.acceptedShare) return 'accepted'
  return roll < shape.acceptedShare + shape.pendingShare
    ? 'pending'
    : 'declined'
}

function timed(
  ask: Ask,
  joined: ReadonlyMap<string, number>,
  shape: Shape,
  random: () => number,
): SeedConnection {
  const bothIn = Math.min(
    joined.get(ask.from) ?? 0,
    joined.get(ask.challenge.authorEmail) ?? 0,
    ask.challenge.postedHoursAgo ?? 0,
  )
  const requestedHoursAgo = between(
    random,
    shape.earliestAnswerHoursAgo,
    bothIn,
  )
  const status = statusOf(random, shape)
  const answered = Math.max(
    requestedHoursAgo - between(random, 0, shape.maxAnswerHours),
    Math.min(shape.earliestAnswerHoursAgo, requestedHoursAgo),
  )
  return {
    requesterEmail: ask.from,
    targetEmail: ask.challenge.authorEmail,
    kind: ask.kind,
    status,
    challenge: {
      authorEmail: ask.challenge.authorEmail,
      body: ask.challenge.body,
    },
    requestedHoursAgo,
    respondedHoursAgo: status === 'pending' ? null : answered,
  }
}

/** Requests between members over their challenges: peers in the same boat
 * and members who have been there, each after both joined, most accepted,
 * some pending, a few declined (R-SEED-10). */
export function connectionsFor(
  members: readonly SeedMember[],
  challenges: readonly SeedChallenge[],
  expertise: readonly SeedExpertise[],
  shape: Shape = networkShape,
): SeedConnection[] {
  const random = seeded(shape.seed + 1)
  const joined = new Map(
    members.map((member) => [member.email, member.joinedHoursAgo ?? 0]),
  )
  const seen = new Set<string>()
  return challenges
    .flatMap((challenge) =>
      asksFor(challenge, challenges, expertise, shape, random),
    )
    .filter((ask) => {
      const key = `${ask.from}>${ask.challenge.authorEmail}`
      if (seen.has(key) || !joined.has(ask.from)) return false
      seen.add(key)
      return random() < shape.requestChance
    })
    .map((ask) => timed(ask, joined, shape, random))
}
