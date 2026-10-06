import { and, eq, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import {
  invites,
  members,
  outbox,
  outboxQuotes,
  sessions,
} from '../db/schema.js'
import type { DeleteOutcome, EraseOutcome, ErasureStore } from './erasure.js'
import type { Holding } from './roles.js'
import { lockedHoldings } from './role-grant-store.js'

type Refusal = Exclude<EraseOutcome, 'erased'>
interface Locked {
  email: string
  status: (typeof members.$inferSelect)['status']
  eraseAfter: Date | null
}

// The checks deleting and erasing share, made with the member's row locked.
async function lockedOrRefused(
  db: Database,
  memberId: string,
  guardedRoles: readonly string[],
  mayErase: (holdings: readonly Holding[]) => boolean,
): Promise<Locked | Refusal> {
  // The holders go first: locking them also locks their member rows, so two
  // erasures queue here in one order rather than deadlocking on each other.
  const holdings = await lockedHoldings(db, guardedRoles)
  const [member] = await db
    .select({
      email: members.email,
      status: members.status,
      eraseAfter: members.eraseAfter,
    })
    .from(members)
    .where(eq(members.id, memberId))
    .for('update')
  if (member === undefined) return 'not_found'

  // Invites have no cascade: a poster batch outlives the admin who made it,
  // so its creator is kept until the invites are dealt with (R-INV-8).
  const created = await db
    .select({ id: invites.id })
    .from(invites)
    .where(eq(invites.createdBy, memberId))
    .limit(1)
  if (created.length > 0) return 'created_invites'

  if (!mayErase(holdings)) return 'last_admin'
  return member
}

// Sessions hold the member id inside their data, with no foreign key.
async function endSessions(db: Database, memberId: string): Promise<void> {
  await db
    .delete(sessions)
    .where(sql`(${sessions.data})::jsonb ->> 'memberId' = ${memberId}`)
}

async function eraseChecked(
  db: Database,
  memberId: string,
  guardedRoles: readonly string[],
  mayErase: (holdings: readonly Holding[]) => boolean,
): Promise<EraseOutcome> {
  const member = await lockedOrRefused(db, memberId, guardedRoles, mayErase)
  if (typeof member === 'string') return member

  // A digest quotes several members, each listed in outbox_quotes; erasing
  // any of them erases the entry (R-MSG-6).
  await db
    .delete(outbox)
    .where(
      or(
        eq(outbox.memberId, memberId),
        eq(outbox.toEmail, member.email),
        inArray(
          outbox.id,
          db
            .select({ id: outboxQuotes.outboxId })
            .from(outboxQuotes)
            .where(eq(outboxQuotes.memberId, memberId)),
        ),
      ),
    )
  await endSessions(db, memberId)
  // The rest goes by cascade: roles, tokens, challenges, expertise, follows,
  // swipes, deck views and connection requests on either side (design §2).
  await db.delete(members).where(eq(members.id, memberId))
  return 'erased'
}

async function deactivateChecked(
  db: Database,
  memberId: string,
  guardedRoles: readonly string[],
  mayErase: (holdings: readonly Holding[]) => boolean,
  plan: { eraseAfter: Date; bySelf: boolean },
): Promise<DeleteOutcome> {
  const member = await lockedOrRefused(db, memberId, guardedRoles, mayErase)
  if (typeof member === 'string') return { result: member }
  if (member.status === 'deleted' && member.eraseAfter !== null)
    return { result: 'scheduled', eraseAfter: member.eraseAfter }

  await db
    .update(members)
    .set({
      status: 'deleted',
      statusBeforeDeletion: member.status,
      eraseAfter: plan.eraseAfter,
      deletedBySelf: plan.bySelf,
    })
    .where(eq(members.id, memberId))
  await endSessions(db, memberId)
  return { result: 'scheduled', eraseAfter: plan.eraseAfter }
}

/** Erasure over the members table and what hangs off it, after the grace
 * period of ADR 0032 (design §2). */
export function createErasureStore(db: Database): ErasureStore {
  return {
    erase: (memberId, guardedRoles, mayErase) =>
      db.transaction((tx) =>
        eraseChecked(tx, memberId, guardedRoles, mayErase),
      ),
    deactivate: (memberId, guardedRoles, mayErase, plan) =>
      db.transaction((tx) =>
        deactivateChecked(tx, memberId, guardedRoles, mayErase, plan),
      ),
    restore: async (memberId, ownOnly) => {
      const restored = await db
        .update(members)
        .set({
          status: sql`coalesce(${members.statusBeforeDeletion}, 'active')`,
          statusBeforeDeletion: null,
          eraseAfter: null,
          deletedBySelf: null,
        })
        .where(
          and(
            eq(members.id, memberId),
            eq(members.status, 'deleted'),
            ownOnly ? eq(members.deletedBySelf, true) : undefined,
          ),
        )
        .returning({ id: members.id })
      return restored.length > 0
    },
    due: async (now) => {
      const rows = await db
        .select({ id: members.id })
        .from(members)
        .where(
          and(
            eq(members.status, 'deleted'),
            isNotNull(members.eraseAfter),
            lte(members.eraseAfter, now),
          ),
        )
      return rows.map((row) => row.id)
    },
  }
}
