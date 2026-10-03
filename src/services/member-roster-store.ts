import { asc, eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { memberRoles, members } from '../db/schema.js'
import type { MemberRoster, RosterMember } from './member-roster.js'

/** The roster over `members` and `member_roles` (design §2). */
export function createMemberRoster(db: Database): MemberRoster {
  return {
    list: async () => {
      const rows = await db
        .select({
          id: members.id,
          email: members.email,
          name: members.name,
          status: members.status,
          createdAt: members.createdAt,
          role: memberRoles.roleKey,
        })
        .from(members)
        .leftJoin(memberRoles, eq(memberRoles.memberId, members.id))
        .orderBy(asc(members.email), asc(memberRoles.roleKey))
      const byId = new Map<string, RosterMember>()
      for (const row of rows) {
        const member = byId.get(row.id) ?? {
          id: row.id,
          email: row.email,
          name: row.name,
          status: row.status,
          roles: [],
          joinedAt: row.createdAt.toISOString(),
        }
        if (row.role !== null) member.roles.push(row.role)
        byId.set(row.id, member)
      }
      return [...byId.values()]
    },
  }
}
