import { asc, count, eq, type SQL } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { Database } from '../db/connect.js'
import {
  challenges,
  connectionRequests,
  invites,
  memberRoles,
  members,
} from '../db/schema.js'
import { isOptedIn } from './analytics-consent.js'
import { companySizeLabel, sectorLabel } from './profile-labels.js'
import type {
  MemberDetail,
  MemberRoster,
  RosterMember,
} from './member-roster.js'

const listed = {
  id: members.id,
  email: members.email,
  name: members.name,
  jobTitle: members.jobTitle,
  org: members.org,
  sector: sectorLabel,
  companySize: companySizeLabel,
  status: members.status,
  createdAt: members.createdAt,
  role: memberRoles.roleKey,
}

interface ListedRow {
  id: string
  email: string
  name: string | null
  jobTitle: string | null
  org: string | null
  sector: string | null
  companySize: string | null
  status: RosterMember['status']
  createdAt: Date
  role: string | null
}

function oneMemberPerId(rows: ListedRow[]): RosterMember[] {
  const byId = new Map<string, RosterMember>()
  for (const row of rows) {
    const member = byId.get(row.id) ?? {
      id: row.id,
      email: row.email,
      name: row.name,
      jobTitle: row.jobTitle,
      org: row.org,
      sector: row.sector,
      companySize: row.companySize,
      status: row.status,
      roles: [],
      joinedAt: row.createdAt.toISOString(),
    }
    if (row.role !== null) member.roles.push(row.role)
    byId.set(member.id, member)
  }
  return [...byId.values()]
}

async function countOf(
  db: Database,
  table: PgTable,
  column: AnyPgColumn,
  id: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(table)
    .where(eq(column, id))
  return row?.n ?? 0
}

function rowsFor(db: Database, where?: SQL): Promise<ListedRow[]> {
  return db
    .select(listed)
    .from(members)
    .leftJoin(memberRoles, eq(memberRoles.memberId, members.id))
    .where(where)
    .orderBy(asc(members.email), asc(memberRoles.roleKey))
}

async function detailOf(
  db: Database,
  analyticsVersion: string,
  member: RosterMember,
): Promise<MemberDetail | null> {
  const [extra] = await db
    .select({
      requestedName: members.requestedName,
      requestedOrg: members.requestedOrg,
      consentVersion: members.consentVersion,
      consentAt: members.consentAt,
      analyticsConsentVersion: members.analyticsConsentVersion,
      analyticsConsentAt: members.analyticsConsentAt,
      joinedVia: invites.label,
    })
    .from(members)
    .leftJoin(invites, eq(invites.id, members.joinedViaInviteId))
    .where(eq(members.id, member.id))
  if (extra === undefined) return null
  const sent = connectionRequests.requesterId
  const received = connectionRequests.targetId
  return {
    ...member,
    requestedName: extra.requestedName,
    requestedOrg: extra.requestedOrg,
    joinedVia: extra.joinedVia,
    consentVersion: extra.consentVersion,
    consentAt: extra.consentAt?.toISOString() ?? null,
    analyticsOptIn: isOptedIn(extra, analyticsVersion),
    challenges: await countOf(db, challenges, challenges.memberId, member.id),
    requestsSent: await countOf(db, connectionRequests, sent, member.id),
    requestsReceived: await countOf(
      db,
      connectionRequests,
      received,
      member.id,
    ),
  }
}

/** The roster over `members` and `member_roles` (design §2), with each
 * member's page judged against the analytics words in force. */
export function createMemberRoster(
  db: Database,
  analyticsVersion: string,
): MemberRoster {
  return {
    list: async () => oneMemberPerId(await rowsFor(db)),
    detail: async (id) => {
      const [member] = oneMemberPerId(await rowsFor(db, eq(members.id, id)))
      return member === undefined
        ? null
        : detailOf(db, analyticsVersion, member)
    },
  }
}
