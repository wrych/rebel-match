import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { TestProject } from 'vitest/node'
import { connect, onClient } from '../../../src/db/connect.js'
import { applyMigrations } from '../../../src/db/migrate.js'
import {
  dropCopies,
  onServer,
  quoted,
  templateOf,
  withDatabase,
} from './own-database.js'

declare module 'vitest' {
  export interface ProvidedContext {
    /** A migrated PGlite's data folder, as a tarball each file loads. */
    pgliteSnapshot: string
  }
}

type Teardown = () => Promise<void>

/** On Postgres, migrates the template every file's own database is copied
 * from, and drops the copies when the run ends. */
async function postgresTemplate(url: string): Promise<Teardown> {
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

/** On PGlite, migrates one database and keeps its data folder, which each
 * file loads in place of starting from nothing and migrating its own. */
async function pgliteSnapshot(project: TestProject): Promise<Teardown> {
  const dir = await mkdtemp(join(tmpdir(), 'rebel-match-pglite-'))
  const client = await PGlite.create()
  const connection = onClient(client)
  try {
    await applyMigrations(connection)
    const tarball = await client.dumpDataDir('none')
    await writeFile(
      join(dir, 'snapshot.tar'),
      Buffer.from(await tarball.arrayBuffer()),
    )
  } finally {
    await connection.close()
  }
  project.provide('pgliteSnapshot', join(dir, 'snapshot.tar'))

  return () => rm(dir, { recursive: true, force: true })
}

/** Migrates once per run what every file's own database starts from. */
export default function setup(project: TestProject): Promise<Teardown> {
  const url = process.env['DATABASE_URL']
  return url === undefined || url === ''
    ? pgliteSnapshot(project)
    : postgresTemplate(url)
}
