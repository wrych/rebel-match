import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AppDeps } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
})
const reported = randomUUID()
const reporter = randomUUID()
const request = randomUUID()
const challenge = randomUUID()
const harassing = randomUUID()
const words = 'You are useless, quit already.'
const report = {
  oldHandled: randomUUID(),
  newHandled: randomUUID(),
  oldOpen: randomUUID(),
  note: randomUUID(),
}

let db: TestDatabase
let deps: AppDeps

async function reportIds(): Promise<string[]> {
  const rows = await db.query(
    'SELECT id FROM reports WHERE reported_id = ? ORDER BY id',
    [reported],
  )
  return rows.map((row) => String(row['id']))
}

async function count(sql: string, id: string): Promise<number> {
  const rows = await db.query(sql, [id])
  return Number(rows[0]?.['n'])
}

beforeAll(async () => {
  db = await openTestDatabase()
  deps = composeApp(config, db.drizzle)
  await db.query(
    `INSERT INTO members (id, email, status, analytics_id)
     VALUES (?, ?, 'active', ?), (?, ?, 'active', ?)`,
    [
      reported,
      `${reported}@example.invalid`,
      randomUUID(),
      reporter,
      `${reporter}@example.invalid`,
      randomUUID(),
    ],
  )
  await db.query(
    `INSERT INTO connection_requests (id, requester_id, target_id, kind, message, status)
     VALUES (?, ?, ?, 'same_boat', 'Buy my course.', 'accepted'),
            (?, ?, ?, 'been_there', ?, 'declined')`,
    [request, reported, reporter, harassing, reported, reporter, words],
  )
  await db.query(
    `INSERT INTO challenges (id, member_id, body, status)
     VALUES (?, ?, 'Join my paid bootcamp to fix your team.', 'active')`,
    [challenge, reported],
  )
  await db.query(
    `INSERT INTO reports (id, reporter_id, reported_id, request_id, challenge_id, note_text, reason, created_at, handled_at)
     VALUES (?, ?, ?, ?, NULL, 'Buy my course.', 'spam', now() - interval '300 days', now() - interval '200 days'),
            (?, NULL, ?, ?, NULL, 'Buy my course.', 'spam', now() - interval '300 days', now() - interval '10 days'),
            (?, ?, ?, NULL, ?, NULL, 'other', now() - interval '300 days', NULL),
            (?, ?, ?, ?, NULL, ?, 'inappropriate', now(), NULL)`,
    [
      report.oldHandled,
      reporter,
      reported,
      request,
      report.newHandled,
      reported,
      request,
      report.oldOpen,
      reporter,
      reported,
      challenge,
      report.note,
      reporter,
      reported,
      harassing,
      words,
    ],
  )
  await db.query(
    `INSERT INTO moderation_actions (id, member_id, actor_id, kind, request_id)
     VALUES (?, ?, NULL, 'dismiss', ?)`,
    [randomUUID(), reported, request],
  )
})

afterAll(async () => {
  await db.query('DELETE FROM members WHERE id IN (?, ?)', [reported, reporter])
  await db.close()
})

describe('how long reports are kept, over Postgres (R-MOD-11)', () => {
  it('deletes handled reports past the retention, keeping open and recent ones', async () => {
    const cutoff = new Date(Date.now() - 180 * 86_400_000)

    expect(await deps.moderation.purgeHandledBefore(cutoff)).toBe(1)
    expect(await reportIds()).toEqual(
      [report.newHandled, report.oldOpen, report.note].sort(),
    )
  })

  it('keeps a reporter’s reports, naming nobody, once they are erased', async () => {
    expect(await deps.erasure.erase(reporter)).toBe('erased')

    const rows = await db.query(
      'SELECT reporter_id FROM reports WHERE id = ?',
      [report.oldOpen],
    )
    expect(rows).toEqual([{ reporter_id: null }])
  })

  it('keeps a note reported by a member since erased, with its words, for hosts to act on', async () => {
    const page = await deps.moderation.page(reported)
    const kept = page?.items.find((item) => item.id === report.note)

    expect(kept).toMatchObject({
      kind: 'note',
      body: words,
      sentTo: null,
      state: 'erased',
      reports: [{ reason: 'inappropriate', reporter: null, open: true }],
    })
    expect(page?.open.reports).toBe(2)
    expect(
      await deps.moderation.dismiss({ reportId: report.note }, reported),
    ).toBe('dismissed')
    expect(
      (await deps.moderation.page(reported))?.items.find(
        (item) => item.id === report.note,
      )?.reports[0]?.open,
    ).toBe(false)
  })

  it('erases the reports and the history with the reported member (R-NFR-7)', async () => {
    expect(await deps.erasure.erase(reported)).toBe('erased')

    expect(
      await count(
        'SELECT count(*)::int AS n FROM reports WHERE reported_id = ?',
        reported,
      ),
    ).toBe(0)
    expect(
      await count(
        'SELECT count(*)::int AS n FROM moderation_actions WHERE member_id = ?',
        reported,
      ),
    ).toBe(0)
  })
})
