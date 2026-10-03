import pg from 'pg'

const CONNECT_TIMEOUT_MS = 3000

async function reachable(): Promise<boolean> {
  const connectionString = process.env['DATABASE_URL']
  if (connectionString === undefined) return false

  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  })
  try {
    await client.connect()
    await client.end()
    return true
  } catch {
    return false
  }
}

process.exitCode = (await reachable()) ? 0 : 1
