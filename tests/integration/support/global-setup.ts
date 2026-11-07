import { connect } from '../../../src/db/connect.js'
import { applyMigrations } from '../../../src/db/migrate.js'
import {
  dropCopies,
  onServer,
  quoted,
  templateOf,
  withDatabase,
} from './own-database.js'

/** On Postgres, migrates the template every file's own database is copied
 * from, once per run, and drops the copies when the run ends. */
export default async function setup(): Promise<
  (() => Promise<void>) | undefined
> {
  const url = process.env['DATABASE_URL']
  if (url === undefined || url === '') return undefined

  const template = quoted(templateOf(url))
  await dropCopies(url)
  await onServer(
    url,
    `DROP DATABASE IF EXISTS ${template} WITH (FORCE)`,
    `CREATE DATABASE ${template}`,
  )
  const connection = await connect({
    kind: 'postgres',
    url: withDatabase(url, templateOf(url)),
  })
  try {
    await applyMigrations(connection)
  } finally {
    await connection.close()
  }

  return async () => {
    await dropCopies(url)
    await onServer(url, `DROP DATABASE IF EXISTS ${template} WITH (FORCE)`)
  }
}
