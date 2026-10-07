import { and, eq, isNotNull, ne, notExists, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import {
  challenges,
  deckViews,
  gameDays,
  inviteOpens,
  invites,
  members,
  swipes,
} from '../db/schema.js'
import type { ActivityStore } from './activity.js'

// One statement: an open is written only when the token names an invite.
async function recordOpen(
  db: Database,
  { id, token }: { id: string; token: string },
): Promise<void> {
  await db.insert(inviteOpens).select(
    db
      .select({
        id: sql<string>`${id}`.as('id'),
        inviteId: invites.id,
        openedAt: sql<Date>`now()`.as('opened_at'),
      })
      .from(invites)
      .where(eq(invites.token, token)),
  )
}

/** Activity records over Postgres (design §2, deck_views). */
export function createActivityStore(db: Database): ActivityStore {
  return {
    // One statement: the view is written only when the challenge is one the
    // deck deals the member (the deck store's conditions, answered cards out), so a stray or forged id records nothing. Drizzle
    // wants every column of the table, in its order.
    recordView: async ({ id, memberId, challengeId }) => {
      const answered = db
        .select({ challengeId: swipes.challengeId })
        .from(swipes)
        .where(
          and(
            eq(swipes.memberId, memberId),
            eq(swipes.challengeId, challenges.id),
          ),
        )
      const dealable = db
        .select({
          id: sql<string>`${id}`.as('id'),
          memberId: sql<string>`${memberId}`.as('member_id'),
          challengeId: challenges.id,
          seenAt: sql<Date>`now()`.as('seen_at'),
        })
        .from(challenges)
        .innerJoin(members, eq(members.id, challenges.memberId))
        .where(
          and(
            eq(challenges.id, challengeId),
            eq(challenges.status, 'active'),
            eq(members.status, 'active'),
            isNotNull(members.name),
            ne(challenges.memberId, memberId),
            notExists(answered),
          ),
        )
      const written = await db
        .insert(deckViews)
        .select(dealable)
        .returning({ id: deckViews.id })
      return written.length > 0
    },
    forgetHistory: async (memberId) => {
      await db.transaction(async (tx) => {
        await tx.delete(deckViews).where(eq(deckViews.memberId, memberId))
        await tx.delete(gameDays).where(eq(gameDays.memberId, memberId))
      })
    },
    recordOpen: (open) => recordOpen(db, open),
  }
}
