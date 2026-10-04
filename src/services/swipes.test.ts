import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent } from './analytics.js'
import type { NewConnection } from './connections.js'
import { createSwipes, type SwipeAction } from './swipes.js'

function setup(connect: 'created' | 'exists' | 'not_found' = 'created'): {
  swipes: ReturnType<typeof createSwipes>
  recorded: [string, string, SwipeAction][]
  follows: [string, string][]
  requests: [string, NewConnection][]
  tracked: [string, AnalyticsEvent][]
} {
  const tracked: [string, AnalyticsEvent][] = []
  const recorded: [string, string, SwipeAction][] = []
  const follows: [string, string][] = []
  const requests: [string, NewConnection][] = []
  const swipes = createSwipes({
    track: (memberId, event) => {
      tracked.push([memberId, event])
      return Promise.resolve()
    },
    store: {
      target: (challengeId, viewerId) =>
        Promise.resolve(
          challengeId === 'c-bob' && viewerId !== 'm-bob'
            ? { authorId: 'm-bob', trendId: '06' }
            : null,
        ),
      record: (m, c, a) => {
        recorded.push([m, c, a])
        return Promise.resolve()
      },
      follow: (m, t) => {
        follows.push([m, t])
        return Promise.resolve()
      },
    },
    connections: {
      request: (requester, input) => {
        requests.push([requester, input])
        return Promise.resolve(
          connect === 'not_found'
            ? { result: 'not_found' }
            : { result: connect, id: 'r-1' },
        )
      },
    },
  })
  return { swipes, recorded, follows, requests, tracked }
}

describe('createSwipes', () => {
  it('reports each swipe with its action and the card’s trend (R-ANA-1)', async () => {
    const { swipes, tracked } = setup()

    await swipes.swipe('m-ada', { challengeId: 'c-bob', action: 'skip' })

    expect(tracked).toEqual([
      ['m-ada', { name: 'swipe', action: 'skip', trend_id: '06' }],
    ])
  })

  it('reports nothing for a card that is not there', async () => {
    const { swipes, tracked } = setup()

    await swipes.swipe('m-bob', { challengeId: 'c-bob', action: 'skip' })

    expect(tracked).toEqual([])
  })

  it('asks the author to connect on same boat, through the opt-in (R-OFF-3)', async () => {
    const { swipes, recorded, requests } = setup()

    expect(
      await swipes.swipe('m-ada', {
        challengeId: 'c-bob',
        action: 'same_boat',
      }),
    ).toEqual({
      result: 'recorded',
      connection: { result: 'created', id: 'r-1' },
    })
    expect(requests).toEqual([
      [
        'm-ada',
        {
          targetId: 'm-bob',
          challengeId: 'c-bob',
          kind: 'same_boat',
          message: undefined,
        },
      ],
    ])
    expect(recorded).toEqual([['m-ada', 'c-bob', 'same_boat']])
  })

  it('carries the been-there note to the author (R-OFF-4)', async () => {
    const { swipes, requests } = setup()
    const note =
      'We rebuilt our decision charter twice; happy to walk you through it.'

    await swipes.swipe('m-ada', {
      challengeId: 'c-bob',
      action: 'been_there',
      note,
    })

    expect(requests[0]?.[1]).toMatchObject({
      kind: 'been_there',
      message: note,
    })
  })

  it('follows the card’s trend, asking nobody (R-OFF-3)', async () => {
    const { swipes, follows, requests } = setup()

    await swipes.swipe('m-ada', { challengeId: 'c-bob', action: 'follow' })

    expect(follows).toEqual([['m-ada', '06']])
    expect(requests).toEqual([])
  })

  it('records a skip and nothing else', async () => {
    const { swipes, recorded, follows, requests } = setup()

    await swipes.swipe('m-ada', { challengeId: 'c-bob', action: 'skip' })

    expect(recorded).toEqual([['m-ada', 'c-bob', 'skip']])
    expect(follows).toEqual([])
    expect(requests).toEqual([])
  })

  it('reports an existing request instead of a second one (R-CONN-5)', async () => {
    const { swipes } = setup('exists')

    expect(
      await swipes.swipe('m-ada', {
        challengeId: 'c-bob',
        action: 'same_boat',
      }),
    ).toEqual({
      result: 'recorded',
      connection: { result: 'exists', id: 'r-1' },
    })
  })

  it.each([
    ['their own challenge', 'm-bob', 'c-bob'],
    ['a challenge that is gone', 'm-ada', 'c-gone'],
  ])('records nothing for %s (R-OFF-1)', async (_n, viewer, challengeId) => {
    const { swipes, recorded } = setup()

    expect(await swipes.swipe(viewer, { challengeId, action: 'skip' })).toEqual(
      {
        result: 'not_found',
      },
    )
    expect(recorded).toEqual([])
  })

  it('records nothing when the author can no longer be asked', async () => {
    const { swipes, recorded } = setup('not_found')

    expect(
      await swipes.swipe('m-ada', {
        challengeId: 'c-bob',
        action: 'same_boat',
      }),
    ).toEqual({ result: 'not_found' })
    expect(recorded).toEqual([])
  })
})
