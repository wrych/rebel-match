import { randomUUID } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { RoleKey } from '../access.js'
import type { Database } from '../db/connect.js'
import {
  cases,
  challenges,
  companySizes,
  connectionRequests,
  memberExpertise,
  memberRoles,
  members,
  roles,
  sectors,
  trends,
} from '../db/schema.js'
import type {
  SeedCase,
  SeedChallenge,
  SeedConnection,
  SeedExpertise,
  SeedMember,
  SeedOption,
  SeedPlan,
} from './types.js'

const SEEDED_ADMIN_ROLES: readonly RoleKey[] = ['member', 'admin']
const MS_PER_HOUR = 3_600_000

const hoursBefore = (now: Date, hours: number): Date =>
  new Date(now.getTime() - hours * MS_PER_HOUR)

// The value an upsert would have written: Postgres calls that row `excluded`.
const excluded = (column: string): ReturnType<typeof sql> =>
  sql.raw(`excluded.${column}`)

async function upsertOptions(
  db: Database,
  table: typeof sectors | typeof companySizes,
  options: readonly SeedOption[],
): Promise<void> {
  for (const option of options) {
    await db
      .insert(table)
      .values(option)
      .onConflictDoUpdate({
        target: table.key,
        set: { label: excluded('label') },
      })
  }
}

async function memberIdOf(db: Database, email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.email, email))
  return row?.id ?? null
}

// Times are written only when the member is new, so a re-run never moves
// when someone joined (R-SEED-7, R-SEED-10).
async function upsertMember(
  db: Database,
  member: SeedMember,
  consentVersion: string,
  now: Date,
): Promise<void> {
  const joinedAt = hoursBefore(now, member.joinedHoursAgo ?? 0)
  await db
    .insert(members)
    .values({
      id: randomUUID(),
      email: member.email,
      name: member.name,
      jobTitle: member.jobTitle,
      org: member.org,
      sector: member.sector,
      companySize: member.companySize,
      status: 'active',
      consentVersion,
      consentAt: joinedAt,
      firstOnboardedAt: joinedAt,
      createdAt: joinedAt,
      analyticsId: randomUUID(),
    })
    .onConflictDoUpdate({
      target: members.email,
      set: {
        name: excluded('name'),
        jobTitle: excluded('job_title'),
        org: excluded('org'),
        sector: excluded('sector'),
        companySize: excluded('company_size'),
        status: 'active',
      },
    })
  const memberId = await memberIdOf(db, member.email)
  if (memberId === null) return
  for (const role of member.roles) {
    await db
      .insert(memberRoles)
      .values({ memberId, roleKey: role })
      .onConflictDoNothing()
  }
}

// Only a new address is granted, so a re-run never undoes a host taking the
// role away; no name or consent, so onboarding still asks (R-SEED-6, R-SEED-9).
async function insertAdmin(db: Database, email: string): Promise<void> {
  const [created] = await db
    .insert(members)
    .values({
      id: randomUUID(),
      email,
      status: 'active',
      analyticsId: randomUUID(),
    })
    .onConflictDoNothing({ target: members.email })
    .returning({ id: members.id })
  if (created === undefined) return
  for (const role of SEEDED_ADMIN_ROLES) {
    await db.insert(memberRoles).values({ memberId: created.id, roleKey: role })
  }
}

async function upsertCase(db: Database, item: SeedCase): Promise<void> {
  await db
    .insert(cases)
    .values(item)
    .onConflictDoUpdate({
      target: [cases.trendId, cases.url],
      set: { org: excluded('org'), takeaway: excluded('takeaway') },
    })
}

// A challenge has no natural key of its own, so author and text stand in.
async function insertChallenge(
  db: Database,
  challenge: SeedChallenge,
  now: Date,
): Promise<void> {
  const memberId = await memberIdOf(db, challenge.authorEmail)
  if (memberId === null) return
  const [existing] = await db
    .select({ id: challenges.id })
    .from(challenges)
    .where(
      and(
        eq(challenges.memberId, memberId),
        eq(challenges.body, challenge.body),
      ),
    )
    .limit(1)
  if (existing !== undefined) return
  await db.insert(challenges).values({
    id: randomUUID(),
    memberId,
    body: challenge.body,
    trendId: challenge.trendId,
    autoTrend: challenge.trendId,
    createdAt: hoursBefore(now, challenge.postedHoursAgo ?? 0),
  })
}

async function challengeIdOf(
  db: Database,
  challenge: SeedConnection['challenge'],
): Promise<string | null> {
  if (challenge === null) return null
  const authorId = await memberIdOf(db, challenge.authorEmail)
  if (authorId === null) return null
  const [row] = await db
    .select({ id: challenges.id })
    .from(challenges)
    .where(
      and(
        eq(challenges.memberId, authorId),
        eq(challenges.body, challenge.body),
      ),
    )
    .limit(1)
  return row?.id ?? null
}

// A request is known by its two members and its challenge; one already there,
// in whatever state, is left as it is (R-SEED-7). An accepted one counts as
// opened by both, so a dev nav does not start badged.
async function insertConnection(
  db: Database,
  request: SeedConnection,
  now: Date,
): Promise<void> {
  const requesterId = await memberIdOf(db, request.requesterEmail)
  const targetId = await memberIdOf(db, request.targetEmail)
  if (requesterId === null || targetId === null) return
  const challengeId = await challengeIdOf(db, request.challenge)
  const [existing] = await db
    .select({ id: connectionRequests.id })
    .from(connectionRequests)
    .where(
      and(
        eq(connectionRequests.requesterId, requesterId),
        eq(connectionRequests.targetId, targetId),
        challengeId === null
          ? isNull(connectionRequests.challengeId)
          : eq(connectionRequests.challengeId, challengeId),
      ),
    )
    .limit(1)
  if (existing !== undefined) return
  const respondedAt =
    request.respondedHoursAgo === null
      ? null
      : hoursBefore(now, request.respondedHoursAgo)
  const seenAt = request.status === 'accepted' ? respondedAt : null
  await db.insert(connectionRequests).values({
    id: randomUUID(),
    requesterId,
    targetId,
    challengeId,
    kind: request.kind,
    status: request.status,
    createdAt: hoursBefore(now, request.requestedHoursAgo),
    respondedAt,
    requesterSeenAt: seenAt,
    targetSeenAt: seenAt,
  })
}

async function upsertExpertise(
  db: Database,
  offer: SeedExpertise,
): Promise<void> {
  const memberId = await memberIdOf(db, offer.email)
  if (memberId === null) return
  await db
    .insert(memberExpertise)
    .values({ memberId, trendId: offer.trendId, note: offer.note })
    .onConflictDoUpdate({
      target: [memberExpertise.memberId, memberExpertise.trendId],
      set: { note: excluded('note') },
    })
}

async function applyPlan(
  db: Database,
  plan: SeedPlan,
  consentVersion: string,
): Promise<void> {
  for (const role of plan.roles) {
    await db
      .insert(roles)
      .values({
        roleKey: role.key,
        label: role.label,
        description: role.description,
      })
      .onConflictDoUpdate({
        target: roles.roleKey,
        set: { label: excluded('label'), description: excluded('description') },
      })
  }
  for (const trend of plan.trends) {
    const { from, ...rest } = trend
    await db
      .insert(trends)
      .values({ ...rest, fromLabel: from })
      .onConflictDoUpdate({
        target: trends.id,
        set: {
          short: excluded('short'),
          fromLabel: excluded('from_label'),
          peers: excluded('peers'),
          keywords: excluded('keywords'),
        },
      })
  }
  for (const item of plan.cases) await upsertCase(db, item)
  await upsertOptions(db, sectors, plan.sectors)
  await upsertOptions(db, companySizes, plan.companySizes)
  const now = new Date()
  for (const member of plan.members) {
    await upsertMember(db, member, consentVersion, now)
  }
  for (const email of plan.admins) await insertAdmin(db, email)
  for (const challenge of plan.challenges)
    await insertChallenge(db, challenge, now)
  for (const offer of plan.expertise) await upsertExpertise(db, offer)
  for (const request of plan.connections)
    await insertConnection(db, request, now)
}

/** Applies a plan in one transaction, upserting by natural key so a re-run
 * changes nothing it already made (R-SEED-7). */
export function applySeed(
  db: Database,
  plan: SeedPlan,
  consentVersion: string,
): Promise<void> {
  return db.transaction((tx) => applyPlan(tx, plan, consentVersion))
}
