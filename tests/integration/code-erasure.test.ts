import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
  CONNECT_CODES: '1',
})

let db: TestDatabase
let deps: ReturnType<typeof composeApp>

async function codesOf(memberId: string): Promise<number> {
  const [profile] = await db.query(
    'SELECT count(*)::int AS n FROM profile_codes WHERE member_id = ?',
    [memberId],
  )
  const [live] = await db.query(
    'SELECT count(*)::int AS n FROM live_codes WHERE member_id = ?',
    [memberId],
  )
  return Number(profile?.['n']) + Number(live?.['n'])
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  await db.query("DELETE FROM members WHERE id LIKE 'ce-%'")
  for (const id of ['ce-owner', 'ce-scanner', 'ce-erased'])
    await db.query(
      "INSERT INTO members (id, email, name, status, consent_version, consent_at, analytics_id) VALUES (?, ?, ?, 'active', ?, now(), ?)",
      [id, `${id}@example.invalid`, `Member ${id}`, config.consentVersion, id],
    )
  deps = composeApp(config, db.drizzle)
})

afterAll(async () => {
  await db.query("DELETE FROM members WHERE id LIKE 'ce-%'")
  await db.close()
})

describe('codes with the account (R-CODE-10, R-NFR-7)', () => {
  it('stops a member’s codes the moment they ask to be deleted', async () => {
    const profile = await deps.profileCodes.mine('ce-owner')
    const live = await deps.liveCodes.issue('ce-owner')
    if (live.result !== 'issued') throw new Error('no live code')

    expect(await deps.erasure.delete('ce-owner', true)).not.toBe('not_found')
    expect(await deps.profileCodes.open('ce-scanner', profile.token)).toBeNull()
    expect(
      await deps.liveCodes.redeem('ce-scanner', live.code.token),
    ).toBeNull()
  })

  it('deletes a member’s codes with them', async () => {
    await deps.profileCodes.mine('ce-erased')
    await deps.liveCodes.issue('ce-erased')
    expect(await codesOf('ce-erased')).toBe(2)

    expect(await deps.erasure.erase('ce-erased')).toBe('erased')
    expect(await codesOf('ce-erased')).toBe(0)
  })
})
