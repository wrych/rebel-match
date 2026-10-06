import { and, desc, eq, getTableColumns, isNull, lt, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { invites, members, inviteOpens } from '../db/schema.js'
import type { InviteStore, ListedInvite } from './invites.js'

const listedColumns = {
  ...getTableColumns(invites),
  creatorEmail: members.email,
  // A count per invite: the one way opens are read back (R-STAT-6).
  opens: sql<number>`(SELECT count(*)::int FROM ${inviteOpens} WHERE ${inviteOpens.inviteId} = ${invites.id})`,
}
const byCreator = eq(members.id, invites.createdBy)

/** Invites over `invites` (design §2). Every read goes to the table, never a
 * cache, so a revocation holds on the next use (R-INV-3). */
export function createInviteStore(db: Database): InviteStore {
  return {
    list: (): Promise<ListedInvite[]> =>
      db
        .select(listedColumns)
        .from(invites)
        .innerJoin(members, byCreator)
        .orderBy(desc(invites.createdAt), invites.id),
    find: async (id) => {
      const [row] = await db
        .select(listedColumns)
        .from(invites)
        .innerJoin(members, byCreator)
        .where(eq(invites.id, id))
      return row ?? null
    },
    insert: async (invite) => {
      await db.insert(invites).values(invite)
    },
    revoke: async (id, at) => {
      const revoked = await db
        .update(invites)
        .set({ revokedAt: sql`coalesce(${invites.revokedAt}, ${at})` })
        .where(eq(invites.id, id))
        .returning({ id: invites.id })
      return revoked.length === 1
    },
    raiseCap: async (id, maxUses) => {
      const raised = await db
        .update(invites)
        .set({ maxUses })
        .where(
          and(
            eq(invites.id, id),
            isNull(invites.revokedAt),
            lt(invites.maxUses, maxUses),
          ),
        )
        .returning({ id: invites.id })
      return raised.length === 1
    },
  }
}
