import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/config.js'
import { createSettingOverrideStore } from '../../src/services/setting-override-store.js'
import { createSettings } from '../../src/services/settings.js'
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
const host = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }
const KEY = 'limits.beenThereNoteMinChars'

let db: TestDatabase

beforeAll(async () => {
  db = await openTestDatabase()
  await db.query(
    "INSERT INTO members (id, email, name, status, analytics_id) VALUES (?, ?, 'Ada Host', 'active', ?)",
    [host.id, host.email, randomUUID()],
  )
})

afterAll(async () => {
  await db.query('DELETE FROM setting_overrides WHERE key = ?', [KEY])
  await db.query('DELETE FROM members WHERE id = ?', [host.id])
  await db.close()
})

describe('setting overrides (R-CFG-6, ADR 0031)', () => {
  it('keeps the latest change with who made it, and shares it between servers', async () => {
    const store = createSettingOverrideStore(db.drizzle)
    const here = createSettings({ config, store })
    const there = createSettings({ config, store })

    await here.change(KEY, 40, host.id)
    await here.change(KEY, 45, host.id)
    await there.refresh()

    expect(there.limits().beenThereNoteMinChars).toBe(45)
    expect(there.overrides()).toMatchObject([
      { key: KEY, value: 45, changedBy: host.id, changerName: 'Ada Host' },
    ])
  })

  it('goes back to the deployment’s value by deleting the row', async () => {
    const settings = createSettings({
      config,
      store: createSettingOverrideStore(db.drizzle),
    })
    await settings.change(KEY, 40, host.id)

    await settings.reset(KEY)

    expect(
      await db.query('SELECT key FROM setting_overrides WHERE key = ?', [KEY]),
    ).toEqual([])
    expect(settings.limits().beenThereNoteMinChars).toBe(
      config.limits.beenThereNoteMinChars,
    )
  })

  it('keeps the value but names nobody once its author is erased', async () => {
    const author = {
      id: randomUUID(),
      email: `${randomUUID()}@example.invalid`,
    }
    await db.query(
      "INSERT INTO members (id, email, status, analytics_id) VALUES (?, ?, 'active', ?)",
      [author.id, author.email, randomUUID()],
    )
    const settings = createSettings({
      config,
      store: createSettingOverrideStore(db.drizzle),
    })
    await settings.change(KEY, 42, author.id)

    await db.query('DELETE FROM members WHERE id = ?', [author.id])
    await settings.refresh()

    expect(settings.overrides()).toMatchObject([
      { key: KEY, value: 42, changedBy: null, changerName: null },
    ])
  })
})
