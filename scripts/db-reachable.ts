import pg from 'pg'

const CONNECT_TIMEOUT_MS = 3000

// Without a URL the run is local on PGlite, which is always there (ADR 0024).
async function reachable(): Promise<boolean> {
  const connectionString = process.env['DATABASE_URL']
  if (connectionString === undefined || connectionString === '') return true

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
