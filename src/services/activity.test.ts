import { describe, expect, it } from 'vitest'
import { createActivity, type ActivityStore } from './activity.js'

function setup(dealable: boolean): {
  store: ActivityStore
  views: { id: string; memberId: string; challengeId: string }[]
  forgotten: string[]
} {
  const views: { id: string; memberId: string; challengeId: string }[] = []
  const forgotten: string[] = []
  return {
    views,
    forgotten,
    store: {
      recordView: (view) => {
        if (dealable) views.push(view)
        return Promise.resolve(dealable)
      },
      forgetViews: (memberId) => {
        forgotten.push(memberId)
        return Promise.resolve()
      },
    },
  }
}

describe('activity (ADR 0033)', () => {
  it('records each showing as its own view (R-STAT-1)', async () => {
    const { store, views } = setup(true)
    let n = 0
    const activity = createActivity({ store, newId: () => `v-${String(++n)}` })

    expect(await activity.viewed('m-ada', 'c-1')).toBe('recorded')
    expect(await activity.viewed('m-ada', 'c-1')).toBe('recorded')

    expect(views).toEqual([
      { id: 'v-1', memberId: 'm-ada', challengeId: 'c-1' },
      { id: 'v-2', memberId: 'm-ada', challengeId: 'c-1' },
    ])
  })

  it('says not found when the deck could not have shown it', async () => {
    const { store } = setup(false)
    const activity = createActivity({ store, newId: () => 'v' })

    expect(await activity.viewed('m-ada', 'c-own')).toBe('not_found')
  })

  it("forgets only the member's own history (R-STAT-4)", async () => {
    const { store, forgotten } = setup(true)
    const activity = createActivity({ store, newId: () => 'v' })

    await activity.forgetHistory('m-ada')

    expect(forgotten).toEqual(['m-ada'])
  })
})
