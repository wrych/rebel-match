import { describe, expect, it } from 'vitest'
import {
  checksumOf,
  orderMigrationNames,
  planMigrations,
  type Migration,
} from './plan.js'

const migration = (name: string, sql: string): Migration => ({ name, sql })

describe('orderMigrationNames', () => {
  it('orders by the numeric prefix, not by discovery order', () => {
    const ordered = orderMigrationNames([
      '003_magic_tokens.sql',
      '001_members.sql',
      '002_roles.sql',
    ])

    expect(ordered).toEqual([
      '001_members.sql',
      '002_roles.sql',
      '003_magic_tokens.sql',
    ])
  })

  it('ignores files that are not migrations', () => {
    expect(orderMigrationNames(['001_members.sql', 'README.md'])).toEqual([
      '001_members.sql',
    ])
  })

  it('refuses a filename it cannot order', () => {
    expect(() => orderMigrationNames(['members.sql'])).toThrow(
      /NNN_lower_snake\.sql/,
    )
  })

  it('refuses two migrations with the same number', () => {
    expect(() =>
      orderMigrationNames(['001_members.sql', '001_roles.sql']),
    ).toThrow(/share the number 001/)
  })

  it('allows gaps, since a migration may be dropped before it merges', () => {
    expect(
      orderMigrationNames(['001_members.sql', '004_outbox.sql']),
    ).toHaveLength(2)
  })
})

describe('checksumOf', () => {
  it('ignores reformatting, which is not a change of meaning', () => {
    expect(checksumOf('CREATE TABLE a (id INT);')).toBe(
      checksumOf('CREATE  TABLE a (id INT);\n'),
    )
  })

  it('notices a changed statement', () => {
    expect(checksumOf('CREATE TABLE a (id INT);')).not.toBe(
      checksumOf('CREATE TABLE b (id INT);'),
    )
  })
})

describe('planMigrations', () => {
  it('runs everything on an empty database', () => {
    const available = [migration('001_a.sql', 'A'), migration('002_b.sql', 'B')]

    const plan = planMigrations(available, [])

    expect(plan.toApply.map((m) => m.name)).toEqual(['001_a.sql', '002_b.sql'])
  })

  it('runs only what is pending, in order', () => {
    const available = [migration('001_a.sql', 'A'), migration('002_b.sql', 'B')]
    const applied = [{ name: '001_a.sql', checksum: checksumOf('A') }]

    const plan = planMigrations(available, applied)

    expect(plan.toApply.map((m) => m.name)).toEqual(['002_b.sql'])
    expect(plan.alreadyApplied).toEqual(['001_a.sql'])
  })

  it('is a no-op when everything has run, so re-running is safe', () => {
    const available = [migration('001_a.sql', 'A')]
    const applied = [{ name: '001_a.sql', checksum: checksumOf('A') }]

    expect(planMigrations(available, applied).toApply).toEqual([])
  })

  it('refuses to run when an applied migration was edited', () => {
    const available = [migration('001_a.sql', 'A changed')]
    const applied = [{ name: '001_a.sql', checksum: checksumOf('A') }]

    expect(() => planMigrations(available, applied)).toThrow(
      /already ran and have since been edited/,
    )
  })

  it('refuses to run when an applied migration has disappeared', () => {
    const applied = [{ name: '001_a.sql', checksum: checksumOf('A') }]

    expect(() => planMigrations([], applied)).toThrow(
      /no longer in the repository/,
    )
  })
})
