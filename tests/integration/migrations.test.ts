import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mysql from 'mysql2/promise'
import { migrate } from '../../src/migrations/run.js'
import { readMigrations } from '../../src/migrations/run.js'

const databaseUrl = process.env['DATABASE_URL']

if (databaseUrl === undefined) {
  throw new Error('integration tests need DATABASE_URL')
}

const url = databaseUrl

async function tableNames(): Promise<string[]> {
  const connection = await mysql.createConnection({ uri: url })
  try {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT table_name AS t FROM information_schema.tables ' +
        'WHERE table_schema = DATABASE()',
    )
    return rows.map((row) => String(row['t'])).sort()
  } finally {
    await connection.end()
  }
}

async function dropEverything(): Promise<void> {
  const connection = await mysql.createConnection({
    uri: url,
    multipleStatements: true,
  })
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const name of await tableNames()) {
      await connection.query(`DROP TABLE IF EXISTS \`${name}\``)
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1')
  } finally {
    await connection.end()
  }
}

describe('migrations', () => {
  beforeAll(dropEverything)
  afterAll(dropEverything)

  it('runs from an empty database (R-QA-4)', async () => {
    const applied = await migrate(url, 'migrations')
    const expected = (await readMigrations('migrations')).map((m) => m.name)

    expect(applied).toEqual(expected)
  })

  it('creates every table the login and ask journeys need', async () => {
    expect(await tableNames()).toEqual([
      'cases',
      'challenges',
      'connection_requests',
      'follows',
      'invites',
      'magic_tokens',
      'member_expertise',
      'member_roles',
      'members',
      'outbox',
      'roles',
      'schema_migrations',
      'sessions',
      'swipes',
      'trends',
    ])
  })

  it('is a no-op when run again, so deploys are idempotent', async () => {
    expect(await migrate(url, 'migrations')).toEqual([])
  })

  it('refuses to run when an applied migration has been edited', async () => {
    const connection = await mysql.createConnection({ uri: url })
    try {
      await connection.query(
        "UPDATE schema_migrations SET checksum = 'tampered' WHERE name = ?",
        ['001_members.sql'],
      )
    } finally {
      await connection.end()
    }

    await expect(migrate(url, 'migrations')).rejects.toThrow(
      /already ran and have since been edited/,
    )
  })
})
