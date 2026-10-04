import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { latestAnalyticsVersion } from '../../src/analytics-consent.js'
import { createAnalyticsIds } from '../../src/services/analytics-ids-store.js'
import { openTestDatabase, type TestDatabase } from './support/database.js'

const member = { id: randomUUID(), analyticsId: randomUUID() }

let db: TestDatabase

async function setOptIn(
  version: string | null,
  at: string | null,
): Promise<void> {
  await db.query(
    'UPDATE members SET analytics_consent_version = ?, analytics_consent_at = ? WHERE id = ?',
    [version, at, member.id],
  )
}

beforeAll(async () => {
  db = await openTestDatabase()
  await db.query(
    "INSERT INTO members (id, email, status, analytics_id) VALUES (?, ?, 'active', ?)",
    [member.id, `${randomUUID()}@example.invalid`, member.analyticsId],
  )
})

afterAll(async () => {
  await db.query('DELETE FROM members WHERE id = ?', [member.id])
  await db.close()
})

describe('analytics ids over Postgres (R-ANA-2, R-ANA-4)', () => {
  const ids = (): ReturnType<typeof createAnalyticsIds> =>
    createAnalyticsIds(db.drizzle, latestAnalyticsVersion)

  it('releases nothing for a member who never opted in', async () => {
    expect(await ids().optedIn(member.id)).toBeNull()
  })

  it('releases the pseudonymous id, never the member id, once opted in', async () => {
    await setOptIn(latestAnalyticsVersion, new Date().toISOString())

    expect(await ids().optedIn(member.id)).toBe(member.analyticsId)
  })

  it('releases nothing for an opt-in to older words, or a withdrawn one', async () => {
    await setOptIn('2000-01-01', new Date().toISOString())
    expect(await ids().optedIn(member.id)).toBeNull()

    await setOptIn(null, null)
    expect(await ids().optedIn(member.id)).toBeNull()
  })

  it('releases nothing for an unknown member', async () => {
    expect(await ids().optedIn(randomUUID())).toBeNull()
  })
})
