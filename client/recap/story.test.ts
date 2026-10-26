import { describe, expect, it } from 'vitest'
import type { Recap, RecapRow } from '../lib/recap'
import { compared, storyOf } from './story'

const row = (
  name: RecapRow['row'],
  count: number,
  extra: Partial<RecapRow> = {},
): RecapRow => ({
  row: name,
  count,
  level: null,
  reached: 0,
  levels: 3,
  crown: { name: `${name} crown`, held: false },
  below: null,
  ...extra,
})

const recap = (rows: RecapRow[], members = 3): Recap => ({
  joined: '2026-09-02',
  members,
  rows,
  timeline: {
    nodes: Array.from({ length: members }, (_, id) => ({
      id,
      at: id / 2,
      day: '2026-09-02',
      self: id === 1,
    })),
    links: [],
    moons: [],
    own: null,
  },
})

describe('storyOf (R-RECAP-2)', () => {
  it('opens, says when they joined, and ends on the network and the card', () => {
    const kinds = storyOf(recap([])).map((beat) => beat.kind)

    expect(kinds).toEqual(['intro', 'joined', 'network', 'card'])
  })

  it('gives the joined beat their place in the order of joining', () => {
    const joined = storyOf(recap([])).find((beat) => beat.kind === 'joined')

    expect(joined).toEqual({
      kind: 'joined',
      day: '2026-09-02',
      number: 2,
      at: 0.5,
    })
  })

  it('leaves out a row at zero rather than showing nothing', () => {
    const beats = storyOf(
      recap([row('speak', 0), row('help', 1), row('connect', 7)]),
    )

    expect(
      beats.flatMap((beat) => (beat.kind === 'row' ? [beat.row] : [])),
    ).toEqual(['help', 'connect'])
  })

  it('names what a row counts by its number, with level and comparison', () => {
    const beats = storyOf(
      recap([
        row('help', 1),
        row('speak', 4, { level: 'Agitator', below: 80 }),
      ]),
    )

    expect(beats.filter((beat) => beat.kind === 'row')).toEqual([
      {
        kind: 'row',
        row: 'help',
        title: 'Offer help',
        count: 1,
        counts: 'offer of help',
        level: null,
        reached: 0,
        levels: 3,
        crowned: false,
        compared: null,
      },
      {
        kind: 'row',
        row: 'speak',
        title: 'Speak up',
        count: 4,
        counts: 'challenges posted',
        level: 'Agitator',
        reached: 0,
        levels: 3,
        crowned: false,
        compared: 'Ahead of 80% of rebels',
      },
    ])
  })

  it('gathers the crowns held into one beat, and none without any', () => {
    const held = storyOf(
      recap([
        row('speak', 3, { crown: { name: 'Ringleader', held: true } }),
        row('boat', 2),
      ]),
    )

    expect(held.find((beat) => beat.kind === 'crowns')).toEqual({
      kind: 'crowns',
      names: ['Ringleader'],
    })
    expect(
      storyOf(recap([row('boat', 2)])).some((beat) => beat.kind === 'crowns'),
    ).toBe(false)
  })

  it('says nothing to compare without a share', () => {
    expect(compared(null)).toBeNull()
    expect(compared(95)).toBe('Ahead of 95% of rebels')
  })
})
