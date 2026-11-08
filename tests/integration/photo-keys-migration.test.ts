import { copyFile, mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect, type Connection } from '../../src/db/connect.js'
import { applyMigrations, MIGRATIONS_DIR } from '../../src/db/migrate.js'
import { serverUrl } from './support/database.js'

const url = serverUrl()
let connection: Connection

// The migrations as they stood before photo keys, so a photo can be stored
// the way 0036 left it.
async function migrationsBefore(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'migrations-'))
  for (const file of await readdir(MIGRATIONS_DIR))
    if (file.endsWith('.sql') && file < name)
      await copyFile(join(MIGRATIONS_DIR, file), join(dir, file))
  return dir
}

describe('0037_photo_keys (R-PROF-7, ADR 0067)', () => {
  beforeAll(async () => {
    connection = await connect(
      url === undefined ? { kind: 'pglite' } : { kind: 'postgres', url },
    )
    await connection.runScript(
      'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
    )
  })
  afterAll(async () => {
    await connection.close()
  })

  it('gives each photo added before keys a key of its own', async () => {
    await applyMigrations(connection, await migrationsBefore('0037'))
    const ids = [randomUUID(), randomUUID()]
    for (const id of ids) {
      await connection.db.execute(
        sql`INSERT INTO members (id, email, analytics_id) VALUES (${id}, ${`${id}@example.invalid`}, ${randomUUID()})`,
      )
      await connection.db.execute(
        sql`INSERT INTO member_photos (member_id, jpeg) VALUES (${id}, ${Buffer.from('jpeg')})`,
      )
    }

    expect(await applyMigrations(connection)).toContain('0037_photo_keys.sql')

    const keys = await connection.rows<{ key: string | null }>(
      sql`SELECT key FROM member_photos`,
    )
    expect(keys).toHaveLength(2)
    for (const { key } of keys) expect(key).toMatch(/^[\w-]{43}$/)
    expect(keys[0]?.key).not.toBe(keys[1]?.key)
  })
})
