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

const env = {
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
}
const declines = 'milan.horvat@example.invalid'

let db: TestDatabase

async function count(query: string): Promise<number> {
  const rows = await db.query(query)
  return Number(rows[0]?.['n'])
}

const recapNotes = (): Promise<number> =>
  count("SELECT count(*)::int AS n FROM notifications WHERE type = 'recap'")
const recapMails = (): Promise<number> =>
  count("SELECT count(*)::int AS n FROM outbox WHERE kind = 'recap'")

async function clear(): Promise<void> {
  await db.query("DELETE FROM notifications WHERE type = 'recap'")
  await db.query("DELETE FROM outbox WHERE kind = 'recap'")
  await db.query('DELETE FROM recap_announcement')
  await db.query("DELETE FROM notification_settings WHERE type = 'recap'")
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(loadConfig(env)), 'v1')
  await clear()
})

afterAll(async () => {
  await clear()
  await db.close()
})

describe('the recap’s announcement over Postgres (R-RECAP-9)', () => {
  it('tells nobody while the recap is closed', async () => {
    await composeApp(loadConfig(env), db.drizzle).notificationMail.deliverDue()

    expect(await recapNotes()).toBe(0)
  })

  it('tells every onboarded member once, and mails those who said yes', async () => {
    const deps = composeApp(loadConfig({ ...env, RECAP: '1' }), db.drizzle)
    const rows = await db.query('SELECT id FROM members WHERE email = ?', [
      declines,
    ])
    const declinerId = String(rows[0]?.['id'])
    expect(
      await deps.notificationSettings.choose(declinerId, [], 'recap', 'in_app'),
    ).toBe('done')
    const onboarded = await count(
      `SELECT count(*)::int AS n FROM members
        WHERE status = 'active' AND name IS NOT NULL AND consent_at IS NOT NULL`,
    )

    await deps.notificationMail.deliverDue()

    expect(await recapNotes()).toBe(onboarded)
    expect(await recapMails()).toBe(onboarded - 1)
    const declined = await db.query(
      "SELECT mail_status FROM notifications WHERE type = 'recap' AND recipient_id = ?",
      [declinerId],
    )
    expect(declined[0]?.['mail_status']).toBe('skipped')
  })

  it('never tells anyone twice, even from a fresh server', async () => {
    const before = await recapNotes()
    const again = composeApp(loadConfig({ ...env, RECAP: '1' }), db.drizzle)

    await again.notificationMail.deliverDue()

    expect(await recapNotes()).toBe(before)
  })

  it('refuses any choice but yes or no (R-NOTE-2)', async () => {
    const deps = composeApp(loadConfig(env), db.drizzle)
    const rows = await db.query('SELECT id FROM members WHERE email = ?', [
      declines,
    ])

    expect(
      await deps.notificationSettings.choose(
        String(rows[0]?.['id']),
        [],
        'recap',
        'daily',
      ),
    ).toBe('not_offered')
  })
})
