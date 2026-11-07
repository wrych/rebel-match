import pg from 'pg'

/** The names behind each test file's own Postgres database: one template,
 * migrated once per run, and a copy of it per file, so files run side by side
 * without seeing each other's rows. All are named after the database
 * `DATABASE_URL` names, which itself is left as it is. */

function databaseOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1))
}

export function withDatabase(url: string, database: string): string {
  const next = new URL(url)
  next.pathname = `/${encodeURIComponent(database)}`
  return next.toString()
}

export function templateOf(url: string): string {
  return `${databaseOf(url)}_template`
}

/** The prefix of every per-file copy, so a run can sweep up what a killed
 * run left behind. */
export function copyPrefixOf(url: string): string {
  return `${databaseOf(url)}_file_`
}

export function quoted(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

/** Runs statements on the server, from the database `url` names. CREATE and
 * DROP DATABASE cannot run in a transaction, so this is a plain client. */
export async function onServer(
  url: string,
  ...statements: string[]
): Promise<void> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    for (const statement of statements) await client.query(statement)
  } finally {
    await client.end()
  }
}

export async function dropCopies(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    const { rows } = await client.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE starts_with(datname, $1)',
      [copyPrefixOf(url)],
    )
    for (const { datname } of rows) {
      await client.query(
        `DROP DATABASE IF EXISTS ${quoted(datname)} WITH (FORCE)`,
      )
    }
  } finally {
    await client.end()
  }
}
