import { randomUUID } from 'node:crypto'
import type { PoolConnection } from 'mysql2/promise'
import type { Pool } from '../db.js'
import type {
  SeedCase,
  SeedChallenge,
  SeedExpertise,
  SeedMember,
  SeedPlan,
  SeedRole,
  SeedTrend,
} from './types.js'

async function upsertRole(db: PoolConnection, role: SeedRole): Promise<void> {
  await db.query(
    'INSERT INTO roles (role_key, label, description) VALUES (?, ?, ?) AS new ' +
      'ON DUPLICATE KEY UPDATE label = new.label, description = new.description',
    [role.key, role.label, role.description],
  )
}

async function upsertMember(
  db: PoolConnection,
  member: SeedMember,
  consentVersion: string,
): Promise<void> {
  await db.query(
    'INSERT INTO members (id, email, name, job_title, org, sector, status, ' +
      'consent_version, consent_at, analytics_id) ' +
      "VALUES (?, ?, ?, ?, ?, ?, 'active', ?, UTC_TIMESTAMP(), ?) AS new " +
      'ON DUPLICATE KEY UPDATE name = new.name, job_title = new.job_title, ' +
      "org = new.org, sector = new.sector, status = 'active'",
    [
      randomUUID(),
      member.email,
      member.name,
      member.jobTitle,
      member.org,
      member.sector,
      consentVersion,
      randomUUID(),
    ],
  )
  for (const role of member.roles) {
    await db.query(
      'INSERT IGNORE INTO member_roles (member_id, role_key) ' +
        'SELECT id, ? FROM members WHERE email = ?',
      [role, member.email],
    )
  }
}

async function upsertTrend(
  db: PoolConnection,
  trend: SeedTrend,
): Promise<void> {
  await db.query(
    'INSERT INTO trends (id, short, from_label, peers, keywords) ' +
      'VALUES (?, ?, ?, ?, ?) AS new ON DUPLICATE KEY UPDATE ' +
      'short = new.short, from_label = new.from_label, peers = new.peers, ' +
      'keywords = new.keywords',
    [
      trend.id,
      trend.short,
      trend.from,
      trend.peers,
      JSON.stringify(trend.keywords),
    ],
  )
}

async function upsertCase(db: PoolConnection, item: SeedCase): Promise<void> {
  await db.query(
    'INSERT INTO cases (trend_id, org, url, takeaway) VALUES (?, ?, ?, ?) ' +
      'AS new ON DUPLICATE KEY UPDATE org = new.org, takeaway = new.takeaway',
    [item.trendId, item.org, item.url, item.takeaway],
  )
}

// A challenge has no natural key of its own, so author and text stand in.
async function insertChallenge(
  db: PoolConnection,
  challenge: SeedChallenge,
): Promise<void> {
  await db.query(
    'INSERT INTO challenges (id, member_id, body, trend_id, auto_trend) ' +
      'SELECT ?, m.id, ?, ?, ? FROM members m WHERE m.email = ? ' +
      'AND NOT EXISTS (SELECT 1 FROM challenges c ' +
      'WHERE c.member_id = m.id AND c.body = ?)',
    [
      randomUUID(),
      challenge.body,
      challenge.trendId,
      challenge.trendId,
      challenge.authorEmail,
      challenge.body,
    ],
  )
}

async function upsertExpertise(
  db: PoolConnection,
  offer: SeedExpertise,
): Promise<void> {
  await db.query(
    'INSERT INTO member_expertise (member_id, trend_id, note) ' +
      'SELECT id, ?, ? FROM members WHERE email = ? ' +
      'ON DUPLICATE KEY UPDATE note = ?',
    [offer.trendId, offer.note, offer.email, offer.note],
  )
}

async function applyPlan(
  db: PoolConnection,
  plan: SeedPlan,
  consentVersion: string,
): Promise<void> {
  for (const role of plan.roles) await upsertRole(db, role)
  for (const trend of plan.trends) await upsertTrend(db, trend)
  for (const item of plan.cases) await upsertCase(db, item)
  for (const member of plan.members) {
    await upsertMember(db, member, consentVersion)
  }
  for (const challenge of plan.challenges) await insertChallenge(db, challenge)
  for (const offer of plan.expertise) await upsertExpertise(db, offer)
}

/** Applies a plan in one transaction, upserting by natural key so a re-run
 * changes nothing it already made (R-SEED-7). */
export async function applySeed(
  pool: Pool,
  plan: SeedPlan,
  consentVersion: string,
): Promise<void> {
  const db = await pool.getConnection()
  try {
    await db.beginTransaction()
    await applyPlan(db, plan, consentVersion)
    await db.commit()
  } catch (error) {
    await db.rollback()
    throw error
  } finally {
    db.release()
  }
}
