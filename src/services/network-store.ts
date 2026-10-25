import { and, eq, isNotNull, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { connectionRequests, members } from '../db/schema.js'
import type { NetworkStore } from './network.js'

// Onboarded as the matches view counts it (R-ONB-1): a name and a consent.
// The first onboarding is when they joined; consent stands in for a member
// onboarded before that was recorded.
const onboarded = and(
  eq(members.status, 'active'),
  isNotNull(members.name),
  isNotNull(members.consentAt),
)

/** Reads the network for the replay: ids and times only, no name, email or
 * profile field (R-NET-3). */
export function createNetworkStore(db: Database): NetworkStore {
  return {
    async facts() {
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
      return {
        members: people.map((p) => ({
          id: p.id,
          joinedAt: new Date(p.joinedAt),
        })),
        connections: connections.flatMap((c) =>
          c.formedAt === null ? [] : [{ a: c.a, b: c.b, formedAt: c.formedAt }],
        ),
      }
    },
  }
}
