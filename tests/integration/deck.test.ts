import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import type { DeckCard } from '../../src/services/deck.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
  DECK_PAGE_SIZE: '50',
})
const viewer = 'jonas.brand@example.invalid'

let db: TestDatabase
let app: ReturnType<typeof createApp>
let cookie: string
let viewerId: string

async function deal(): Promise<DeckCard[]> {
  const response = await request(app).get('/api/deck').set('Cookie', cookie)
  return (response.body as { cards: DeckCard[] }).cards
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const rows = await db.query('SELECT id FROM members WHERE email = ?', [
    viewer,
  ])
  viewerId = String(rows[0]?.['id'])
  await db.query('DELETE FROM swipes WHERE member_id = ?', [viewerId])
  const session = await deps.auth.createSession(viewerId)
  cookie = `${session.name}=${session.value}`
})

afterAll(async () => {
  await db.query('DELETE FROM swipes WHERE member_id = ?', [viewerId])
  await db.close()
})

describe('the swipe deck over Postgres (F6)', () => {
  it("deals others' challenges with trend and author, never the viewer's own (R-OFF-1,2)", async () => {
    const cards = await deal()

    expect(cards.length).toBeGreaterThan(5)
    expect(cards.map((c) => c.author.name)).not.toContain('Jonas Brand')
    expect(cards[0]?.trend.short.length).toBeGreaterThan(0)
    expect(cards[0]?.author.name.length).toBeGreaterThan(0)
    expect(JSON.stringify(cards)).not.toContain('@')
  })

  it('shows the sector and company size by label, not key (R-OFF-2)', async () => {
    const cards = await deal()

    expect(
      cards.find((c) => c.author.name === 'Priya Raman')?.author,
    ).toMatchObject({
      org: 'Kestrel Digital',
      sector: 'Software & technology',
      companySize: '251–1,000 employees',
    })
  })

  it('never deals a card again once it was swiped (R-OFF-2)', async () => {
    const [first] = await deal()
    await db.query(
      "INSERT INTO swipes (member_id, challenge_id, action) VALUES (?, ?, 'skip')",
      [viewerId, first?.challengeId],
    )

    const again = await deal()

    expect(again.map((c) => c.challengeId)).not.toContain(first?.challengeId)
  })
})
