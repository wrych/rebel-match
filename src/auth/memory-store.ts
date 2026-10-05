import type { AuthStore, SessionRecord, TokenRecord } from './store.js'

export interface MemoryMember {
  id: string
  email: string
  roles: string[]
  active?: boolean
}

/** An AuthStore held in memory: the fake that lets the seam, and anything that
 * depends on it, be tested without a database (ADR 0015, R-QA-1). */
export interface MemoryAuthStore extends AuthStore {
  readonly tokens: readonly TokenRecord[]
  readonly sessions: readonly SessionRecord[]
}

function sessionMethods(
  sessions: SessionRecord[],
): Pick<
  AuthStore,
  'insertSession' | 'findSession' | 'extendSession' | 'deleteSession'
> {
  return {
    insertSession: (session) => {
      sessions.push({ ...session })
      return Promise.resolve()
    },
    findSession: (idHash) => {
      const session = sessions.find((s) => s.idHash === idHash)
      return Promise.resolve(session === undefined ? null : { ...session })
    },
    extendSession: (idHash, expiresAt) => {
      const session = sessions.find((s) => s.idHash === idHash)
      if (session !== undefined) session.expiresAt = expiresAt
      return Promise.resolve()
    },
    deleteSession: (idHash) => {
      const index = sessions.findIndex((s) => s.idHash === idHash)
      if (index !== -1) sessions.splice(index, 1)
      return Promise.resolve()
    },
  }
}

/** Builds a MemoryAuthStore holding these members. */
export function createMemoryAuthStore(
  members: readonly MemoryMember[],
): MemoryAuthStore {
  const tokens: TokenRecord[] = []
  const sessions: SessionRecord[] = []

  return {
    tokens,
    sessions,
    memberIdByEmail: (email) =>
      Promise.resolve(
        members.find((m) => m.email.toLowerCase() === email.toLowerCase())
          ?.id ?? null,
      ),
    activeMemberRoles: (memberId) => {
      const member = members.find((m) => m.id === memberId)
      const active = member !== undefined && member.active !== false
      return Promise.resolve(active ? [...member.roles] : null)
    },
    insertToken: (token) => {
      tokens.push({ ...token })
      return Promise.resolve()
    },
    findToken: (tokenHash) => {
      const token = tokens.find((t) => t.tokenHash === tokenHash)
      return Promise.resolve(token === undefined ? null : { ...token })
    },
    markTokenUsed: (id, at) => {
      const token = tokens.find((t) => t.id === id && t.usedAt === null)
      if (token !== undefined) token.usedAt = at
      return Promise.resolve(token !== undefined)
    },
    deleteExpired: (now) => {
      const before = { sessions: sessions.length, tokens: tokens.length }
      const live = sessions.filter((s) => s.expiresAt >= now)
      sessions.splice(0, sessions.length, ...live)
      const usable = tokens.filter(
        (t) => t.expiresAt >= now && t.usedAt === null,
      )
      tokens.splice(0, tokens.length, ...usable)
      return Promise.resolve({
        sessions: before.sessions - sessions.length,
        tokens: before.tokens - tokens.length,
      })
    },
    ...sessionMethods(sessions),
  }
}
