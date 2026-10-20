import { describe, expect, it } from 'vitest'
import type { CountedRow } from '../badges/rows.js'
import {
  countingChallenges,
  countingConnections,
  countingSwipes,
  createBadges,
  type BadgeService,
  type BadgeStore,
  type Crown,
  type EarnedLevel,
} from './badges.js'
import type { ChallengeService } from './challenges.js'
import type {
  ConnectionService,
  ConnectionView,
  RequestOutcome,
} from './connections.js'
import type { SwipeOutcome, SwipeService } from './swipes.js'

const levelCounts = [1, 5, 10]

type Held = EarnedLevel & { memberId: string }

const minute = (n: number): Date => new Date(Date.UTC(2026, 10, 8, 10, n))

function memoryStore(): BadgeStore & {
  counts: Map<string, number>
  reached: Map<string, number>
  held: Held[]
  crownList: Crown[]
  launches: number
} {
  const counts = new Map<string, number>()
  const reached = new Map<string, number>()
  const held: Held[] = []
  const crownList: Crown[] = []
  const store = {
    counts,
    reached,
    held,
    crownList,
    launches: 0,
    count: (memberId: string, row: CountedRow) =>
      Promise.resolve(counts.get(`${memberId}:${row}`) ?? 0),
    standings: (row: CountedRow) =>
      Promise.resolve(
        [...counts]
          .filter(([key, count]) => key.endsWith(`:${row}`) && count > 0)
          .map(([key, count]) => ({
            memberId: key.split(':')[0]!,
            count,
            reachedAt: minute(reached.get(key) ?? 0),
          })),
      ),
    crowns: () => Promise.resolve(crownList.map((crown) => ({ ...crown }))),
    setCrown: (row: CountedRow, memberId: string | null, seen: boolean) => {
      const crown = { row, memberId, seenAt: seen ? minute(59) : null }
      const at = crownList.findIndex((each) => each.row === row)
      if (at === -1) crownList.push(crown)
      else crownList[at] = crown
      return Promise.resolve()
    },
    award: (
      memberId: string,
      row: CountedRow,
      levels: readonly number[],
      seen: boolean,
    ) => {
      const added = levels.filter(
        (level) =>
          !held.some(
            (each) =>
              each.memberId === memberId &&
              each.row === row &&
              each.level === level,
          ),
      )
      for (const level of added)
        held.push({
          memberId,
          row,
          level,
          earnedAt: new Date('2026-11-08T10:00:00.000Z'),
          seenAt: seen ? new Date('2026-11-08T10:00:00.000Z') : null,
        })
      return Promise.resolve(added)
    },
    earned: (memberId: string) =>
      Promise.resolve(held.filter((each) => each.memberId === memberId)),
    newCount: (memberId: string) =>
      Promise.resolve(
        held.filter((each) => each.memberId === memberId && !each.seenAt)
          .length +
          crownList.filter(
            (crown) => crown.memberId === memberId && !crown.seenAt,
          ).length,
      ),
    markSeen: (memberId: string, rows: readonly CountedRow[]) => {
      for (const each of held)
        if (each.memberId === memberId && rows.includes(each.row))
          each.seenAt ??= minute(58)
      for (const crown of crownList)
        if (crown.memberId === memberId && rows.includes(crown.row))
          crown.seenAt ??= minute(58)
      return Promise.resolve()
    },
    launched: () => Promise.resolve(store.launches > 0),
    markLaunched: () => {
      store.launches += 1
      return Promise.resolve()
    },
  }
  return store
}

function setup(): {
  badges: BadgeService
  store: ReturnType<typeof memoryStore>
} {
  const store = memoryStore()
  return {
    badges: createBadges({ store, levelCounts: () => levelCounts }),
    store,
  }
}

describe('badge levels (R-BADGE-1, R-BADGE-2)', () => {
  it('records every level a count has reached, as new', async () => {
    const { badges, store } = setup()
    store.counts.set('ana:speak', 6)

    await badges.recount('ana', ['speak'])

    const overview = await badges.mine('ana')
    const speak = overview.rows.find((row) => row.row === 'speak')!
    expect(speak.count).toBe(6)
    expect(
      speak.levels.map((level) => [level.name, level.needs, level.new]),
    ).toEqual([
      ['Spark', 1, true],
      ['Agitator', 5, true],
      ['Firebrand', 10, false],
    ])
    expect(speak.levels[2]!.earnedAt).toBeNull()
  })

  it('keeps a level earned when the count falls', async () => {
    const { badges, store } = setup()
    store.counts.set('ana:help', 5)
    await badges.recount('ana', ['help'])
    store.counts.set('ana:help', 2)

    await badges.recount('ana', ['help'])

    const help = (await badges.mine('ana')).rows.find((r) => r.row === 'help')!
    expect(help.count).toBe(2)
    expect(help.levels.filter((level) => level.earnedAt !== null)).toHaveLength(
      2,
    )
  })

  it('records nothing for a count of zero', async () => {
    const { badges, store } = setup()

    await badges.recount('ana', ['boat', 'connect'])

    expect(store.held).toEqual([])
  })

  it('shows the member every counted row, earned or not, and only theirs', async () => {
    const { badges, store } = setup()
    store.counts.set('ben:connect', 3)
    await badges.recount('ben', ['connect'])

    const overview = await badges.mine('ana')

    expect(overview.rows.map((row) => row.title)).toEqual([
      'Speak up',
      'Offer help',
      'Shared pain',
      'Connect',
    ])
    expect(
      overview.rows.flatMap((row) => row.levels).some((l) => l.earnedAt),
    ).toBe(false)
  })
})

describe('new badges (R-BADGE-10)', () => {
  it('counts levels and crowns gained until their row is seen', async () => {
    const { badges, store } = setup()
    store.counts.set('ana:speak', 1)
    await badges.checkCrowns()
    store.counts.set('ana:help', 5)
    await badges.recount('ana', ['help'])

    expect(await badges.newCount('ana')).toBe(3)

    await badges.seen('ana', ['help'])

    expect(await badges.newCount('ana')).toBe(0)
    const help = (await badges.mine('ana')).rows.find((r) => r.row === 'help')!
    expect(help.levels.some((level) => level.new)).toBe(false)
    expect(help.crown).toEqual({ name: 'Liberator', held: true, new: false })
  })
})

describe('badges at launch (R-BADGE-11)', () => {
  it('records what was earned before, none of it new, once', async () => {
    const { badges, store } = setup()
    store.counts.set('ana:speak', 1)
    store.counts.set('ben:connect', 12)

    await badges.awardAtLaunch()
    await badges.awardAtLaunch()

    expect(store.launches).toBe(1)
    expect(store.held.map((each) => [each.row, each.level])).toEqual([
      ['speak', 1],
      ['connect', 1],
      ['connect', 2],
      ['connect', 3],
    ])
    expect(store.held.every((each) => each.seenAt !== null)).toBe(true)
  })
})

describe('crowns (R-BADGE-3)', () => {
  const crownOf = async (
    badges: BadgeService,
    memberId: string,
  ): Promise<{ held: boolean; new: boolean }> => {
    const { crown } = (await badges.mine(memberId)).rows.find(
      (row) => row.row === 'speak',
    )!
    expect(crown.name).toBe('Ringleader')
    return { held: crown.held, new: crown.new }
  }

  it("gives a row's first crown quietly, as from before launch (R-BADGE-11)", async () => {
    const { badges, store } = setup()
    store.counts.set('ana:speak', 2)

    await badges.checkCrowns()

    expect(await crownOf(badges, 'ana')).toEqual({ held: true, new: false })
    expect(store.crownList.map((crown) => crown.row)).toEqual([
      'speak',
      'help',
      'boat',
      'connect',
    ])
  })

  it('moves the crown to a member who passes the holder, as new', async () => {
    const { badges, store } = setup()
    store.counts.set('ana:speak', 2)
    await badges.checkCrowns()
    store.counts.set('ben:speak', 3)

    await badges.recount('ben', ['speak'])

    expect(await crownOf(badges, 'ben')).toEqual({ held: true, new: true })
    expect(await crownOf(badges, 'ana')).toEqual({ held: false, new: false })
  })

  it('leaves it with the holder on a tie', async () => {
    const { badges, store } = setup()
    store.counts.set('ana:speak', 3)
    store.reached.set('ana:speak', 30)
    await badges.checkCrowns()
    store.counts.set('ben:speak', 3)
    store.reached.set('ben:speak', 1)

    await badges.recount('ben', ['speak'])

    expect(await crownOf(badges, 'ana')).toEqual({ held: true, new: false })
  })

  it("passes it on when the holder's count falls, with nobody acting", async () => {
    const { badges, store } = setup()
    store.counts.set('ana:speak', 4)
    store.counts.set('ben:speak', 2)
    await badges.checkCrowns()
    store.counts.set('ana:speak', 1)

    await badges.checkCrowns()

    expect((await crownOf(badges, 'ben')).held).toBe(true)
  })

  it('stays with nobody until someone qualifies, then is news', async () => {
    const { badges, store } = setup()
    await badges.checkCrowns()
    expect(store.crownList.find((c) => c.row === 'speak')?.memberId).toBeNull()
    store.counts.set('ana:speak', 1)

    await badges.recount('ana', ['speak'])

    expect(await crownOf(badges, 'ana')).toEqual({ held: true, new: true })
  })
})

function recorder(): {
  badges: Pick<BadgeService, 'recount'>
  calls: [string, CountedRow][]
  errors: unknown[]
  fail: () => void
} {
  const calls: [string, CountedRow][] = []
  const errors: unknown[] = []
  let failing = false
  return {
    calls,
    errors,
    fail: () => {
      failing = true
    },
    badges: {
      recount: (memberId, rows) => {
        if (failing) return Promise.reject(new Error('count failed'))
        for (const row of rows) calls.push([memberId, row])
        return Promise.resolve()
      },
    },
  }
}

const unused = (): Promise<never> => Promise.reject(new Error('not used'))

describe('counting where acts are recorded (R-BADGE-1)', () => {
  function challenges(
    outcome: 'saved' | 'not_found' | 'unknown_trend',
  ): ChallengeService {
    return {
      trends: unused,
      create: unused,
      get: unused,
      confirmTrend: () => Promise.resolve(outcome),
      matches: unused,
      trend: unused,
      newest: unused,
    }
  }

  it('counts a challenge for its author when its trend is confirmed', async () => {
    const counted = recorder()
    const service = countingChallenges(
      challenges('saved'),
      counted.badges,
      () => undefined,
    )

    expect(await service.confirmTrend('ana', 'c1', '03')).toBe('saved')
    expect(counted.calls).toEqual([['ana', 'speak']])
  })

  it('counts nothing for a confirmation refused', async () => {
    const counted = recorder()
    const service = countingChallenges(
      challenges('not_found'),
      counted.badges,
      () => undefined,
    )

    await service.confirmTrend('ana', 'c1', '03')

    expect(counted.calls).toEqual([])
  })

  function connections(
    outcome: RequestOutcome,
    other = 'ben',
  ): ConnectionService {
    return {
      request: () => Promise.resolve(outcome),
      incoming: unused,
      connected: unused,
      get: () =>
        Promise.resolve({ other: { memberId: other } } as ConnectionView),
      respond: () => Promise.resolve('done'),
      contact: unused,
    }
  }

  it('counts a same-boat request for the member who sent it', async () => {
    const counted = recorder()
    const service = countingConnections(
      connections({ result: 'created', id: 'r1' }),
      counted.badges,
      () => undefined,
    )

    await service.request('ana', { targetId: 'ben', kind: 'same_boat' })
    await service.request('ana', { targetId: 'ben', kind: 'been_there' })

    expect(counted.calls).toEqual([['ana', 'boat']])
  })

  it('counts a connection joined at once for both members (R-CONN-8)', async () => {
    const counted = recorder()
    const service = countingConnections(
      connections({ result: 'joined', id: 'r1' }),
      counted.badges,
      () => undefined,
    )

    await service.request('ana', { targetId: 'ben', kind: 'been_there' })

    expect(counted.calls).toEqual([
      ['ana', 'connect'],
      ['ben', 'connect'],
    ])
  })

  it('counts nothing for a request refused', async () => {
    const counted = recorder()
    const service = countingConnections(
      connections({ result: 'not_found' }),
      counted.badges,
      () => undefined,
    )

    await service.request('ana', { targetId: 'ben', kind: 'same_boat' })

    expect(counted.calls).toEqual([])
  })

  it('counts an accepted connection for both members, a declined one not at all', async () => {
    const counted = recorder()
    const service = countingConnections(
      connections({ result: 'created', id: 'r1' }, 'ana'),
      counted.badges,
      () => undefined,
    )

    await service.respond('ben', 'r1', 'declined')
    await service.respond('ben', 'r1', 'accepted')

    expect(counted.calls).toEqual([
      ['ben', 'connect'],
      ['ana', 'connect'],
    ])
  })

  function swipes(outcome: SwipeOutcome): SwipeService {
    return { swipe: () => Promise.resolve(outcome) }
  }

  it('counts a "been there" from the deck as help offered', async () => {
    const counted = recorder()
    const service = countingSwipes(
      swipes({ result: 'recorded' }),
      counted.badges,
      () => undefined,
    )

    await service.swipe('ana', {
      challengeId: 'c1',
      action: 'been_there',
      note: 'We ran a decision-mapping sprint and kept the log.',
    })
    await service.swipe('ana', { challengeId: 'c2', action: 'skip' })

    expect(counted.calls).toEqual([['ana', 'help']])
  })

  it('counts nothing for a card that was not there', async () => {
    const counted = recorder()
    const service = countingSwipes(
      swipes({ result: 'not_found' }),
      counted.badges,
      () => undefined,
    )

    await service.swipe('ana', { challengeId: 'c1', action: 'been_there' })

    expect(counted.calls).toEqual([])
  })

  it('reports a failed count and still answers the act', async () => {
    const counted = recorder()
    counted.fail()
    const errors: unknown[] = []
    const service = countingSwipes(
      swipes({ result: 'recorded' }),
      counted.badges,
      (error) => errors.push(error),
    )

    const outcome = await service.swipe('ana', {
      challengeId: 'c1',
      action: 'been_there',
    })

    expect(outcome).toEqual({ result: 'recorded' })
    expect(errors).toHaveLength(1)
  })
})
