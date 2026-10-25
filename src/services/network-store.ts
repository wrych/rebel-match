import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { challenges, connectionRequests, members } from '../db/schema.js'
import { isShown } from './challenge-store.js'
import type { NetworkFacts } from '../network/timeline.js'
import type { NetworkStore } from './network.js'

// Onboarded as the matches view counts it (R-ONB-1): a name and a consent.
// The first onboarding is when they joined; consent stands in for a member
// onboarded before that was recorded.
const onboarded = and(
  eq(members.status, 'active'),
  isNotNull(members.name),
  isNotNull(members.consentAt),
)

async function factsOf(db: Database): Promise<NetworkFacts> {
  const people = await db
    .select({
      id: members.id,
      joinedAt: sql<Date>`coalesce(${members.firstOnboardedAt}, ${members.consentAt})`,
    })
    .from(members)
    .where(onboarded)
  const connections = await db
    .select({
      a: connectionRequests.requesterId,
      b: connectionRequests.targetId,
      formedAt: connectionRequests.respondedAt,
    })
    .from(connectionRequests)
    .where(
      and(
        eq(connectionRequests.status, 'accepted'),
        isNotNull(connectionRequests.respondedAt),
      ),
    )
  // Only what members see: no withdrawn or hidden challenge (R-MOD-8).
  const posted = await db
    .select({
      memberId: challenges.memberId,
      postedAt: challenges.createdAt,
    })
    .from(challenges)
    .where(isShown())
  return {
    challenges: posted,
    members: people.map((p) => ({
      id: p.id,
      joinedAt: new Date(p.joinedAt),
    })),
    connections: connections.flatMap((c) =>
      c.formedAt === null ? [] : [{ a: c.a, b: c.b, formedAt: c.formedAt }],
    ),
  }
}

/** Reads the network for the replay: ids and times only, no name, email,
 * profile field or challenge text (R-NET-3, R-NET-11). */
export function createNetworkStore(db: Database): NetworkStore {
  return {
    facts: () => factsOf(db),
    async idsByEmail(emails) {
      if (emails.length === 0) return new Map()
      const rows = await db
        .select({ id: members.id, email: members.email })
        .from(members)
        .where(and(onboarded, inArray(members.email, [...emails])))
      return new Map(rows.map((row) => [row.email.toLowerCase(), row.id]))
    },
  }
}
