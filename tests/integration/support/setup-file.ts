import { randomBytes } from 'node:crypto'
import { afterAll } from 'vitest'
import {
  copyPrefixOf,
  onServer,
  quoted,
  templateOf,
  withDatabase,
} from './own-database.js'

// Runs before the test file is imported, so everything it reads from
// DATABASE_URL names this file's own copy of the migrated template.
const url = process.env['DATABASE_URL']

if (url !== undefined && url !== '') {
  const copy = `${copyPrefixOf(url)}${randomBytes(6).toString('hex')}`
  await onServer(
    url,
    `CREATE DATABASE ${quoted(copy)} TEMPLATE ${quoted(templateOf(url))}`,
  )
  process.env['DATABASE_URL'] = withDatabase(url, copy)

  afterAll(async () => {
    await onServer(url, `DROP DATABASE IF EXISTS ${quoted(copy)} WITH (FORCE)`)
  })
}
