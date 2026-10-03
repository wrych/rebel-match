import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import {
  cases,
  challenges,
  memberExpertise,
  memberRoles,
  members,
  roles,
  trends,
} from '../db/schema.js'
import type {
  SeedCase,
  SeedChallenge,
  SeedExpertise,
  SeedMember,
  SeedPlan,
} from './types.js'

// The value an upsert would have written: Postgres calls that row `excluded`.
const excluded = (column: string): ReturnType<typeof sql> =>
  sql.raw(`excluded.${column}`)

async function memberIdOf(db: Database, email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.email, email))
  return row?.id ?? null
}

async function upsertMember(
  db: Database,
  member: SeedMember,
  consentVersion: string,
): Promise<void> {
  await db
    .insert(members)
    .values({
      id: randomUUID(),
      email: member.email,
      name: member.name,
      jobTitle: member.jobTitle,
      org: member.org,
      sector: member.sector,
      status: 'active',
      consentVersion,
      consentAt: new Date(),
      analyticsId: randomUUID(),
    })
    .onConflictDoUpdate({
      target: members.email,
      set: {
        name: excluded('name'),
        jobTitle: excluded('job_title'),
        org: excluded('org'),
        sector: excluded('sector'),
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
  for (const member of plan.members) {
    await upsertMember(db, member, consentVersion)
  }
  for (const challenge of plan.challenges) await insertChallenge(db, challenge)
  for (const offer of plan.expertise) await upsertExpertise(db, offer)
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
