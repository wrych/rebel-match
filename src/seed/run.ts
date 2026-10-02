import { randomUUID } from 'node:crypto'
import type { PoolConnection } from 'mysql2/promise'
import type { Pool } from '../db.js'
import type { SeedMember, SeedPlan, SeedRole } from './types.js'

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
    for (const role of plan.roles) await upsertRole(db, role)
    for (const member of plan.members) {
      await upsertMember(db, member, consentVersion)
    }
    await db.commit()
  } catch (error) {
    await db.rollback()
    throw error
  } finally {
    db.release()
  }
}
