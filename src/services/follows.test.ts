import { describe, expect, it } from 'vitest'
import { createFollows } from './follows.js'

const decide = { id: '06', short: 'DDM', from: 'Central', peers: 29 }

function setup(): {
  follows: ReturnType<typeof createFollows>
  rows: Set<string>
} {
  const rows = new Set<string>()
  const follows = createFollows({
    trends: () => Promise.resolve([decide]),
    store: {
      follow: (m, t) => {
        rows.add(`${m}:${t}`)
        return Promise.resolve()
      },
      unfollow: (m, t) => {
        rows.delete(`${m}:${t}`)
        return Promise.resolve()
      },
      followed: (m) => Promise.resolve(rows.has(`${m}:06`) ? [decide] : []),
    },
  })
  return { follows, rows }
}

describe('createFollows', () => {
  it('follows a known trend and lists it (R-ASK-9, R-MINE-3)', async () => {
    const { follows } = setup()

    expect(await follows.follow('m-ada', '06')).toBe('followed')
    expect(await follows.followed('m-ada')).toEqual([decide])
  })

  it('refuses a trend that does not exist', async () => {
    const { follows, rows } = setup()

    expect(await follows.follow('m-ada', '99')).toBe('unknown_trend')
    expect(rows.size).toBe(0)
  })

  it('unfollows', async () => {
    const { follows } = setup()
    await follows.follow('m-ada', '06')

    await follows.unfollow('m-ada', '06')

    expect(await follows.followed('m-ada')).toEqual([])
  })
})
