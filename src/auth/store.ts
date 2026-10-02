import type { LinkKind } from './types.js'

export interface TokenRecord {
  id: string
  memberId: string
  tokenHash: string
  kind: LinkKind
  nextPath: string
  expiresAt: Date
  usedAt: Date | null
}

export interface SessionRecord {
  idHash: string
  memberId: string
  expiresAt: Date
}

/** Persistence for the seam. Hashes go in and come out; a raw token or session
 * id never reaches a store. */
export interface AuthStore {
  memberIdByEmail(email: string): Promise<string | null>
  /** Roles of an active member, or null when there is no such active member. */
  activeMemberRoles(memberId: string): Promise<string[] | null>
  insertToken(token: TokenRecord): Promise<void>
  findToken(tokenHash: string): Promise<TokenRecord | null>
  /** Marks a token used unless it already was. False means someone got there
   * first, which is what keeps a link single-use under a double click. */
  markTokenUsed(id: string, at: Date): Promise<boolean>
  insertSession(session: SessionRecord): Promise<void>
  findSession(idHash: string): Promise<SessionRecord | null>
  extendSession(idHash: string, expiresAt: Date): Promise<void>
  deleteSession(idHash: string): Promise<void>
}
