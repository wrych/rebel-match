// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BADGES_SEEN,
  badgesLabel,
  bestOf,
  earnedCount,
  fetchNewBadges,
  hasNew,
  markBadgesSeen,
  nextLevel,
  type RowView,
} from './badges'

const level = (
  n: number,
  needs: number,
  earned: boolean,
  isNew = false,
): RowView['levels'][number] => ({
  level: n,
  name: ['Spark', 'Agitator', 'Firebrand'][n - 1]!,
  needs,
  earnedAt: earned ? '2026-11-08T10:00:00.000Z' : null,
  new: isNew,
})

const row = (over: Partial<RowView> = {}): RowView => ({
  row: 'speak',
  title: 'Speak up',
  counts: ['challenge posted', 'challenges posted'],
  explains: 'Each challenge you post counts.',
  count: 6,
  levels: [level(1, 1, true), level(2, 5, true, true), level(3, 10, false)],
  crown: { name: 'Ringleader', held: false, new: false },
  ...over,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a row of badges (R-BADGE-7)', () => {
  it('shows its highest level earned', () => {
    expect(bestOf(row())).toEqual({ tier: 2, name: 'Agitator' })
  })

  it('shows the crown while it is held', () => {
    expect(
      bestOf(row({ crown: { name: 'Ringleader', held: true, new: false } })),
    ).toEqual({ tier: 'crown', name: 'Ringleader' })
  })

  it('shows its first level, locked, with nothing earned', () => {
    const none = row({
      levels: [level(1, 1, false), level(2, 5, false), level(3, 10, false)],
    })
    expect(bestOf(none)).toEqual({ tier: 'locked', name: 'Spark' })
  })

  it('counts levels and crowns earned', () => {
    expect(
      earnedCount({
        rows: [
          row(),
          row({ crown: { name: 'Liberator', held: true, new: false } }),
        ],
      }),
    ).toBe(5)
  })

  it('knows the next level to work towards, and when there is none', () => {
    expect(nextLevel(row())?.name).toBe('Firebrand')
    expect(
      nextLevel(
        row({
          levels: [level(1, 1, true), level(2, 5, true), level(3, 10, true)],
        }),
      ),
    ).toBeNull()
  })

  it('is new while a level or the crown in it is (R-BADGE-10)', () => {
    expect(hasNew(row())).toBe(true)
    expect(
      hasNew(
        row({
          levels: [level(1, 1, true)],
          crown: { name: 'Ringleader', held: true, new: true },
        }),
      ),
    ).toBe(true)
    expect(hasNew(row({ levels: [level(1, 1, true)] }))).toBe(false)
  })
})

describe('new badges in the menu (R-BADGE-10)', () => {
  it('names the count, and nothing without one', () => {
    expect(badgesLabel(2)).toBe('Badges (2 new)')
    expect(badgesLabel(0)).toBe('Badges')
  })

  it('reads anything but a positive whole number as none', async () => {
    for (const count of [3, -1, 1.5, 'two', null]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({ ok: true, json: () => Promise.resolve({ count }) }),
        ),
      )
      expect(await fetchNewBadges()).toBe(count === 3 ? 3 : 0)
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false })),
    )
    expect(await fetchNewBadges()).toBe(0)
  })

  it('marks rows seen and tells the menu, asking nothing for no rows', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const heard = vi.fn()
    window.addEventListener(BADGES_SEEN, heard)

    await markBadgesSeen([])
    await markBadgesSeen(['speak', 'help'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/badges/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: ['speak', 'help'] }),
    })
    expect(heard).toHaveBeenCalledTimes(1)
    window.removeEventListener(BADGES_SEEN, heard)
  })
})
