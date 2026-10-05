import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { members } from '../db/schema.js'
import type { MemberAddresses } from './connection-notice.js'

/** A member's own address, read only to write to them; it is never shown to
 * anyone else (R-CONN-6). */
export function createMemberAddresses(db: Database): MemberAddresses {
  return {
    emailOf: async (memberId) => {
      const [row] = await db
        .select({ email: members.email })
        .from(members)
        .where(and(eq(members.id, memberId), eq(members.status, 'active')))
      return row?.email ?? null
    },
  }
}
