import { is, SQL } from 'drizzle-orm'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { members } from '../db/schema.js'
import { cardColumns } from './profile-labels.js'

const dialect = new PgDialect()
const emailColumns = getTableConfig(members)
  .columns.filter((column) => column.name.includes('email'))
  .map((column) => `"${column.name}"`)

function columnsNamed(value: unknown): string[] {
  const chunk = is(value, SQL) ? value : new SQL([value as SQL])
  return dialect.sqlToQuery(chunk).sql.match(/"[a-z_]+"/g) ?? []
}

describe('cardColumns (R-CONN-6)', () => {
  const named = Object.values(cardColumns).flatMap(columnsNamed)

  it('names the columns a card shows', () => {
    expect(emailColumns).toContain('"email"')
    expect(named).toContain('"job_title"')
  })

  it('selects no email column for a card', () => {
    for (const column of emailColumns) expect(named).not.toContain(column)
  })
})
