import mysql from 'mysql2/promise'

const CONNECT_TIMEOUT_MS = 3000

async function reachable(): Promise<boolean> {
  const uri = process.env['DATABASE_URL']
  if (uri === undefined) return false

  try {
    const connection = await mysql.createConnection({
      uri,
      connectTimeout: CONNECT_TIMEOUT_MS,
    })
    await connection.end()
    return true
  } catch {
    return false
  }
}

process.exitCode = (await reachable()) ? 0 : 1
