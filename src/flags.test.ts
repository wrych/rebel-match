import { describe, expect, it } from 'vitest'
import { assign, bucketOf } from './flags.js'

const members = Array.from({ length: 2000 }, (_, at) => `m-${String(at)}`)

describe('assign (R-EXP-1)', () => {
  it('gives a member the same variant every time', () => {
    const shares = { matches_layout: 50 }

    expect(members.map((id) => assign(id, shares))).toEqual(
      members.map((id) => assign(id, shares)),
    )
  })

  it('shows the treatment to about the share asked for', () => {
    const summary = members.filter(
      (id) => assign(id, { matches_layout: 30 }).matches_layout === 'summary',
    )

    expect(summary.length / members.length).toBeGreaterThan(0.26)
    expect(summary.length / members.length).toBeLessThan(0.34)
  })

  it('shows nobody the treatment at 0% and everybody at 100%', () => {
    const layouts = (share: number): Set<string> =>
      new Set(
        members.map(
          (id) => assign(id, { matches_layout: share }).matches_layout,
        ),
      )

    expect(layouts(0)).toEqual(new Set(['cards']))
    expect(layouts(100)).toEqual(new Set(['summary']))
  })

  it('only moves members to the treatment when the share rises', () => {
    const at = (share: number): string[] =>
      members.filter(
        (id) =>
          assign(id, { matches_layout: share }).matches_layout === 'summary',
      )

    expect(at(60)).toEqual(expect.arrayContaining(at(20)))
  })

  it('buckets from 0 to 99', () => {
    const buckets = members.map((id) => bucketOf('matches_layout', id))

    expect(Math.min(...buckets)).toBe(0)
    expect(Math.max(...buckets)).toBe(99)
  })
})
