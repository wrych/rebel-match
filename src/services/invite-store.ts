import { and, desc, eq, getTableColumns, isNull, lt, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { eventBadges, invites, members, inviteOpens } from '../db/schema.js'
import type {
  EventBadgeView,
  InviteStore,
  ListedInvite,
  StoredEventBadge,
} from './invites.js'

const listedColumns = {
  ...getTableColumns(invites),
  creatorEmail: members.email,
  // A count per invite: the one way opens are read back (R-STAT-6).
  opens: sql<number>`(SELECT count(*)::int FROM ${inviteOpens} WHERE ${inviteOpens.inviteId} = ${invites.id})`,
  badgeName: eventBadges.name,
  badgeTicketLine: eventBadges.ticketLine,
  badgeBigLine: eventBadges.bigLine,
  badgeHasLogo: sql<boolean>`${eventBadges.logoSvg} is not null`,
}
const byCreator = eq(members.id, invites.createdBy)
const byBadge = eq(eventBadges.id, invites.eventBadgeId)

type ListedRow = Omit<ListedInvite, 'eventBadge'> & {
  badgeName: string | null
  badgeTicketLine: string | null
  badgeBigLine: string | null
  badgeHasLogo: boolean
}

function listedOf(row: ListedRow): ListedInvite {
  const { badgeName, badgeTicketLine, badgeBigLine, badgeHasLogo, ...invite } =
    row
  const eventBadge: EventBadgeView | null =
    invite.eventBadgeId === null || badgeName === null
      ? null
      : {
          id: invite.eventBadgeId,
          name: badgeName,
          ticketLine: badgeTicketLine ?? '',
          bigLine: badgeBigLine ?? '',
          hasLogo: badgeHasLogo,
        }
  return { ...invite, eventBadge }
}

// A new event badge goes in with the invite that brings it (R-BADGE-4).
async function insertWithBadge(
  db: Database,
  invite: Parameters<InviteStore['insert']>[0],
  newBadge: StoredEventBadge | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (newBadge !== null) await tx.insert(eventBadges).values(newBadge)
    await tx.insert(invites).values(invite)
  })
}

async function badgeExists(db: Database, id: string): Promise<boolean> {
  const found = await db
    .select({ id: eventBadges.id })
    .from(eventBadges)
    .where(eq(eventBadges.id, id))
  return found.length === 1
}

async function logoOf(db: Database, badgeId: string): Promise<string | null> {
  const [row] = await db
    .select({ logo: eventBadges.logoSvg })
    .from(eventBadges)
    .where(eq(eventBadges.id, badgeId))
  return row?.logo ?? null
}

/** Invites over `invites` (design §2). Every read goes to the table, never a
 * cache, so a revocation holds on the next use (R-INV-3). */
export function createInviteStore(db: Database): InviteStore {
  return {
    list: async (): Promise<ListedInvite[]> =>
      (
        await db
          .select(listedColumns)
          .from(invites)
          .innerJoin(members, byCreator)
          .leftJoin(eventBadges, byBadge)
          .orderBy(desc(invites.createdAt), invites.id)
      ).map(listedOf),
    find: async (id) => {
      const [row] = await db
        .select(listedColumns)
        .from(invites)
        .innerJoin(members, byCreator)
        .leftJoin(eventBadges, byBadge)
        .where(eq(invites.id, id))
      return row === undefined ? null : listedOf(row)
    },
    insert: (invite, newBadge) => insertWithBadge(db, invite, newBadge),
    badgeExists: (id) => badgeExists(db, id),
    logo: (badgeId) => logoOf(db, badgeId),
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
