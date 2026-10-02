import { createHash } from 'node:crypto'

const FILENAME = /^(\d{3})_[a-z0-9_]+\.sql$/

export interface Migration {
  name: string
  sql: string
}

export interface AppliedMigration {
  name: string
  checksum: string
}

export interface MigrationPlan {
  toApply: Migration[]
  alreadyApplied: string[]
}

/** Identifies a migration's contents, so a file that has already run can be
 * recognised if someone edits it. Whitespace-insensitive, because reformatting
 * is not a change of meaning. */
export function checksumOf(sql: string): string {
  return createHash('sha256')
    .update(sql.replace(/\s+/gu, ' ').trim())
    .digest('hex')
}

/** Orders migration filenames, rejecting anything that cannot be ordered
 * unambiguously. Numbering gaps are allowed; duplicate numbers are not. */
export function orderMigrationNames(names: string[]): string[] {
  const sql = names.filter((name) => name.endsWith('.sql'))

  const badlyNamed = sql.filter((name) => !FILENAME.test(name))
  if (badlyNamed.length > 0) {
    throw new Error(
      `migration filenames must be NNN_lower_snake.sql: ${badlyNamed.join(', ')}`,
    )
  }

  const seen = new Map<string, string>()
  for (const name of sql) {
    const prefix = FILENAME.exec(name)?.[1] ?? ''
    const clash = seen.get(prefix)
    if (clash !== undefined) {
      throw new Error(
        `two migrations share the number ${prefix}: ${clash}, ${name}`,
      )
    }
    seen.set(prefix, name)
  }

  return [...sql].sort((a, b) => a.localeCompare(b, 'en'))
}

/** Decides what to run. Refuses to proceed if a migration that already ran has
 * since been edited: migrations are forward-only, so the database and the file
 * would silently disagree (constitution §6). */
export function planMigrations(
  available: Migration[],
  applied: AppliedMigration[],
): MigrationPlan {
  const appliedByName = new Map(applied.map((row) => [row.name, row.checksum]))

  const edited = available.filter((migration) => {
    const previous = appliedByName.get(migration.name)
    return previous !== undefined && previous !== checksumOf(migration.sql)
  })
  if (edited.length > 0) {
    throw new Error(
      'these migrations already ran and have since been edited; add a new ' +
        `migration instead: ${edited.map((m) => m.name).join(', ')}`,
    )
  }

  const availableNames = new Set(available.map((migration) => migration.name))
  const missing = applied.filter((row) => !availableNames.has(row.name))
  if (missing.length > 0) {
    throw new Error(
      'these migrations ran but are no longer in the repository: ' +
        missing.map((row) => row.name).join(', '),
    )
  }

  return {
    toApply: available.filter(
      (migration) => !appliedByName.has(migration.name),
    ),
    alreadyApplied: applied.map((row) => row.name),
  }
}
