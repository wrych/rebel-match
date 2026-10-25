/** A member as the replay shows them: a position in the list, when they appear
 * in the replay, the day they joined, and whether it is the viewer. Nothing
 * else about them leaves the server (R-NET-3). */
export interface NetworkNode {
  id: number
  at: number
  day: string
  self: boolean
}

/** An accepted connection between two nodes: when it appears in the replay,
 * and the day it was made. */
export interface NetworkLink {
  source: number
  target: number
  at: number
  day: string
}

/** The network as it grew: nodes and links each in the order they appear, so
 * any moment of the replay shows a prefix of each. `at` runs from 0 to 1. */
export interface NetworkTimeline {
  nodes: NetworkNode[]
  links: NetworkLink[]
}

/** What the store reads: active, onboarded members and their accepted
 * connections, by member id. */
export interface NetworkFacts {
  members: readonly { id: string; joinedAt: Date }[]
  connections: readonly { a: string; b: string; formedAt: Date }[]
}

// How much of the replay follows the calendar; the rest gives every event the
// same time, so a busy hour plays slower than a quiet week (R-NET-7).
const CALENDAR_SHARE = 0.35
// `at` is rounded to this many steps, so it never tells a moment more exactly
// than the replay needs (R-NET-3).
const PACE_STEPS = 1000

const dayOf = (time: number): string =>
  new Date(time).toISOString().slice(0, 10)

/** Each event's place in the replay, 0 to 1, for events in time order: part
 * calendar time, part rank, so dense stretches slow down (R-NET-7). */
export function paceOf(times: readonly number[]): number[] {
  const first = times[0] ?? 0
  const span = (times[times.length - 1] ?? first) - first
  const last = Math.max(times.length - 1, 1)
  return times.map((time, rank) => {
    const calendar = span === 0 ? rank / last : (time - first) / span
    const blended =
      CALENDAR_SHARE * calendar + (1 - CALENDAR_SHARE) * (rank / last)
    return Math.round(blended * PACE_STEPS) / PACE_STEPS
  })
}

function orderedMembers(facts: NetworkFacts): { id: string; time: number }[] {
  return facts.members
    .map((member) => ({ id: member.id, time: member.joinedAt.getTime() }))
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
}

interface Pair {
  source: number
  target: number
  time: number
}

type Joined = readonly { id: string; time: number }[]

// A link never shows before both its ends.
function pairOf(
  connection: NetworkFacts['connections'][number],
  members: Joined,
  position: ReadonlyMap<string, number>,
): Pair | null {
  const first = position.get(connection.a)
  const second = position.get(connection.b)
  if (first === undefined || second === undefined || first === second)
    return null
  const source = Math.min(first, second)
  const target = Math.max(first, second)
  const ends = Math.max(members[source]?.time ?? 0, members[target]?.time ?? 0)
  return { source, target, time: Math.max(connection.formedAt.getTime(), ends) }
}

// A pair connected over several challenges is one link, from its first
// acceptance.
function earliestPerPair(facts: NetworkFacts, members: Joined): Pair[] {
  const position = new Map(members.map((member, index) => [member.id, index]))
  const pairs = new Map<string, Pair>()
  for (const connection of facts.connections) {
    const pair = pairOf(connection, members, position)
    if (pair === null) continue
    const key = `${String(pair.source)}-${String(pair.target)}`
    const known = pairs.get(key)
    if (known === undefined || pair.time < known.time) pairs.set(key, pair)
  }
  return [...pairs.values()].sort(
    (x, y) => x.time - y.time || x.source - y.source || x.target - y.target,
  )
}

/** Turns member ids into positions and times into replay places and days
 * (R-NET-1, R-NET-3, R-NET-7). Joins and connections share one pace, so the
 * two stay in step. */
export function buildTimeline(
  facts: NetworkFacts,
  viewerId: string | null,
): NetworkTimeline {
  const members = orderedMembers(facts)
  const pairs = earliestPerPair(facts, members)
  const events = [
    ...members.map((member, index) => ({ kind: 'node', index, ...member })),
    ...pairs.map((pair, index) => ({ kind: 'link', index, ...pair })),
  ].sort(
    (a, b) =>
      a.time - b.time ||
      (a.kind === b.kind ? a.index - b.index : a.kind === 'node' ? -1 : 1),
  )
  const pace = paceOf(events.map((event) => event.time))
  const at = { node: [] as number[], link: [] as number[] }
  events.forEach((event, rank) => {
    at[event.kind as 'node' | 'link'][event.index] = pace[rank] ?? 0
  })
  return {
    nodes: members.map((member, index) => ({
      id: index,
      at: at.node[index] ?? 0,
      day: dayOf(member.time),
      self: member.id === viewerId,
    })),
    links: pairs.map((pair, index) => ({
      source: pair.source,
      target: pair.target,
      at: at.link[index] ?? 0,
      day: dayOf(pair.time),
    })),
  }
}
