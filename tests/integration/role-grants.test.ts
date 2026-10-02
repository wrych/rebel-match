import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { RowDataPacket } from 'mysql2/promise'
import { loadConfig } from '../../src/config.js'
import { createPool, type Pool } from '../../src/db.js'
import { migrate } from '../../src/migrations/run.js'
import { configPolicy } from '../../src/permissions.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import { createMysqlRoleGrantStore } from '../../src/services/role-grant-store.js'
import {
  createRoleService,
  type RoleService,
} from '../../src/services/roles.js'

const databaseUrl = process.env['DATABASE_URL']

if (databaseUrl === undefined) {
  throw new Error('integration tests need DATABASE_URL')
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
})
const ana = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }
const ben = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }

let pool: Pool
let roles: RoleService
let setAside: string[] = []

async function rolesOf(memberId: string): Promise<RowDataPacket[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT role_key, granted_by FROM member_roles WHERE member_id = ? ' +
      'ORDER BY role_key',
    [memberId],
  )
  return rows
}

beforeAll(async () => {
  await migrate(databaseUrl, 'migrations')
  pool = createPool(config)
  await applySeed(pool, { ...planSeed(config), members: [] }, '')
  for (const member of [ana, ben]) {
    await pool.query(
      "INSERT INTO members (id, email, status, analytics_id) VALUES (?, ?, 'active', ?)",
      [member.id, member.email, randomUUID()],
    )
  }
  roles = createRoleService({
    store: createMysqlRoleGrantStore(pool),
    policy: configPolicy,
  })
})

beforeEach(async () => {
  // Make Ana and Ben the only active members, so the last-holder rule is tested
  // against a known set of role:grant holders rather than whatever else is in
  // the database. afterAll restores exactly the members set aside here.
  await pool.query('DELETE FROM member_roles WHERE member_id IN (?, ?)', [
    ana.id,
    ben.id,
  ])
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM members WHERE status = 'active' AND id NOT IN (?, ?)",
    [ana.id, ben.id],
  )
  const ids = rows.map((row) => String(row['id']))
  if (ids.length > 0) {
    await pool.query("UPDATE members SET status = 'rejected' WHERE id IN (?)", [
      ids,
    ])
  }
  setAside = [...setAside, ...ids]
})

afterAll(async () => {
  if (setAside.length > 0) {
    await pool.query("UPDATE members SET status = 'active' WHERE id IN (?)", [
      setAside,
    ])
  }
  await pool.query('DELETE FROM members WHERE id IN (?, ?)', [ana.id, ben.id])
  await pool.end()
})

describe('granting and revoking roles over MySQL (R-ROLE-9)', () => {
  it('records who granted a role (R-ROLE-7)', async () => {
    expect(await roles.grant(ana.id, ben.id, 'admin')).toBe('granted')

    expect(await rolesOf(ben.id)).toEqual([
      { role_key: 'admin', granted_by: ana.id },
    ])
  })

  it('refuses to revoke the last holder of role:grant', async () => {
    await roles.grant(ana.id, ana.id, 'admin')

    expect(await roles.revoke(ana.id, 'admin')).toBe('last_holder')
    expect(await rolesOf(ana.id)).toHaveLength(1)
  })

  it('lets only one of two admins revoking each other at once succeed', async () => {
    await roles.grant(ana.id, ana.id, 'admin')
    await roles.grant(ana.id, ben.id, 'admin')

    const outcomes = await Promise.all([
      roles.revoke(ana.id, 'admin'),
      roles.revoke(ben.id, 'admin'),
    ])

    expect(outcomes.sort()).toEqual(['last_holder', 'revoked'])
  })

  it('revokes a role that guards nothing without checking holders', async () => {
    await roles.grant(ana.id, ben.id, 'member')

    expect(await roles.revoke(ben.id, 'member')).toBe('revoked')
    expect(await roles.revoke(ben.id, 'member')).toBe('not_held')
  })
})
