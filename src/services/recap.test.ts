import { describe, expect, it } from 'vitest'
import type { CountedRow } from '../badges/rows.js'
import type { NetworkTimeline } from '../network/timeline.js'
import type { RowView } from './badges.js'
import { createRecap } from './recap.js'

function view(row: RowView['row'], count: number, earned: number): RowView {
  return {
    row,
    title: row,
    counts: ['one', 'many'],
    explains: '',
    count,
    levels: ['First', 'Second', 'Third'].map((name, index) => ({
      level: index + 1,
      name,
      needs: index + 1,
      earnedAt: index < earned ? '2026-10-01T00:00:00.000Z' : null,
      new: false,
    })),
    crown: { name: `${row} crown`, held: row === 'speak', new: true },
  }
}

const timeline = (members: number): NetworkTimeline => ({
  nodes: Array.from({ length: members }, (_, id) => ({
    id,
    at: id / members,
    day: `2026-09-${String(id + 1).padStart(2, '0')}`,
    self: id === 2,
  })),
  links: [],
  moons: [],
  own: { count: 0, needed: 5, shown: false },
})

function recapOf(members: number): {
  recap: ReturnType<typeof createRecap>
  asked: string[]
} {
  const asked: string[] = []
  const recap = createRecap({
    badges: {
      mine: () =>
        Promise.resolve({
          rows: [
            view('speak', 4, 2),
            view('help', 0, 0),
            view('boat', 1, 1),
            view('connect', 2, 1),
            view('game', 7, 3),
          ],
          events: [],
        }),
    },
    standings: (row: CountedRow) => {
      asked.push(row)
      const counts: Record<CountedRow, number[]> = {
        speak: [4, 9],
        help: [],
        boat: [1, 1, 1],
        connect: [2],
      }
      return Promise.resolve(
        counts[row].map((count, index) => ({
          memberId: `m${String(index)}`,
          count,
          reachedAt: new Date(0),
        })),
      )
    },
    network: {
      timeline: (viewer) => {
        asked.push(viewer)
        return Promise.resolve(timeline(members))
      },
    },
    rule: () => ({ step: 5, minMembers: 20, minShare: 1 }),
  })
  return { recap, asked }
}

describe('the recap (R-RECAP-2..4)', () => {
  it('gives the counted rows with their highest level and crown', async () => {
    const { recap } = recapOf(40)

    const mine = await recap.mine('me')

    expect(mine.rows.map((row) => row.row)).toEqual([
      'speak',
      'help',
      'boat',
      'connect',
    ])
    expect(mine.rows[0]).toEqual({
      row: 'speak',
      count: 4,
      level: 'Second',
      reached: 2,
      levels: 3,
      crown: { name: 'speak crown', held: true },
      below: 95,
    })
    expect(mine.rows[1]?.level).toBeNull()
  })

  it('compares each count with everyone as a rounded share', async () => {
    const { recap } = recapOf(40)

    const below = (await recap.mine('me')).rows.map((row) => row.below)

    expect(below).toEqual([95, null, 90, 95])
  })

  it('leaves comparisons out while too few are active', async () => {
    const { recap } = recapOf(19)

    const below = (await recap.mine('me')).rows.map((row) => row.below)

    expect(below).toEqual([null, null, null, null])
  })

  it('marks the caller in the timeline and says when they joined', async () => {
    const { recap, asked } = recapOf(40)

    const mine = await recap.mine('me')

    expect(asked).toContain('me')
    expect(mine.joined).toBe('2026-09-03')
    expect(mine.members).toBe(40)
    expect(mine.timeline.nodes.filter((node) => node.self)).toHaveLength(1)
  })
})
