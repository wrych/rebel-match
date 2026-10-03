import { and, eq, isNull } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { magicTokens, memberRoles, members, sessions } from '../db/schema.js'
import type { AuthStore, SessionRecord, TokenRecord } from './store.js'

const MS_PER_SECOND = 1000

const toSeconds = (at: Date): number => Math.floor(at.getTime() / MS_PER_SECOND)

function toSession(row: typeof sessions.$inferSelect): SessionRecord {
  const data = JSON.parse(String(row.data)) as { memberId: string }
  return {
    idHash: row.sessionId,
    memberId: data.memberId,
    expiresAt: new Date(row.expires * MS_PER_SECOND),
  }
}

async function activeMemberRoles(
  db: Database,
  memberId: string,
): Promise<string[] | null> {
  const rows = await db
    .select({ roleKey: memberRoles.roleKey })
    .from(members)
    .leftJoin(memberRoles, eq(memberRoles.memberId, members.id))
    .where(and(eq(members.id, memberId), eq(members.status, 'active')))
  if (rows.length === 0) return null

  return rows.flatMap((row) => (row.roleKey === null ? [] : [row.roleKey]))
}

function sessionQueries(
  db: Database,
): Pick<
  AuthStore,
  'insertSession' | 'findSession' | 'extendSession' | 'deleteSession'
> {
  return {
    insertSession: async (session) => {
      await db.insert(sessions).values({
        sessionId: session.idHash,
        expires: toSeconds(session.expiresAt),
        data: JSON.stringify({ memberId: session.memberId }),
      })
    },
    findSession: async (idHash) => {
      const [row] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.sessionId, idHash))
      return row === undefined ? null : toSession(row)
    },
    extendSession: async (idHash, expiresAt) => {
      await db
        .update(sessions)
        .set({ expires: toSeconds(expiresAt) })
        .where(eq(sessions.sessionId, idHash))
    },
    deleteSession: async (idHash) => {
      await db.delete(sessions).where(eq(sessions.sessionId, idHash))
    },
  }
}

function tokenQueries(
  db: Database,
): Pick<AuthStore, 'insertToken' | 'findToken' | 'markTokenUsed'> {
  return {
    insertToken: async (token) => {
      await db.insert(magicTokens).values(token)
    },
    findToken: async (tokenHash): Promise<TokenRecord | null> => {
      const [row] = await db
        .select()
        .from(magicTokens)
        .where(eq(magicTokens.tokenHash, tokenHash))
      return row === undefined
        ? null
        : {
            id: row.id,
            memberId: row.memberId,
            tokenHash: row.tokenHash,
            kind: row.kind,
            nextPath: row.nextPath ?? '/',
            expiresAt: row.expiresAt,
            usedAt: row.usedAt,
          }
    },
    markTokenUsed: async (id, at) => {
      const used = await db
        .update(magicTokens)
        .set({ usedAt: at })
        .where(and(eq(magicTokens.id, id), isNull(magicTokens.usedAt)))
        .returning({ id: magicTokens.id })
      return used.length === 1
    },
  }
}

/** The AuthStore over Postgres: `magic_tokens` and `sessions`, plus the two
 * reads of `members` the seam needs to know who a credential belongs to. */
export function createAuthStore(db: Database): AuthStore {
  return {
    memberIdByEmail: async (email) => {
      const [row] = await db
        .select({ id: members.id })
        .from(members)
        .where(eq(members.email, email))
      return row?.id ?? null
    },
    activeMemberRoles: (memberId) => activeMemberRoles(db, memberId),
    ...tokenQueries(db),
    ...sessionQueries(db),
  }
}
