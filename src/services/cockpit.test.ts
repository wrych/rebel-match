import { describe, expect, it } from 'vitest'
import { createCockpit, type CockpitChallenge } from './cockpit.js'

const challenge: CockpitChallenge = {
  id: 'c-1',
  body: 'Nobody knows who can decide what.',
  trend: { id: '06', short: 'Distributed Decision Making' },
  counts: { sameBoat: 3, beenThere: 2, cases: 4 },
}
const trend = {
  id: '07',
  short: 'Radical Transparency',
  from: 'Secrecy',
  peers: 18,
}

describe('createCockpit', () => {
  it("gathers the member's challenges, follows, waiting requests and unseen connections (R-MINE-1,3,4, R-CONN-7)", async () => {
    const asked: string[] = []
    const cockpit = createCockpit({
      store: {
        challenges: (m) => {
          asked.push(`challenges:${m}`)
          return Promise.resolve([challenge])
        },
        pendingIncoming: (m) => {
          asked.push(`pending:${m}`)
          return Promise.resolve(2)
        },
        newConnections: (m) => {
          asked.push(`new:${m}`)
          return Promise.resolve(1)
        },
        markSeen: () => Promise.reject(new Error('not asked')),
      },
      followed: (m) => {
        asked.push(`followed:${m}`)
        return Promise.resolve([trend])
      },
    })

    expect(await cockpit.cockpit('m-ada')).toEqual({
      challenges: [challenge],
      following: [trend],
      pendingIncoming: 2,
      newConnections: 1,
    })
    expect(asked.sort()).toEqual([
      'challenges:m-ada',
      'followed:m-ada',
      'new:m-ada',
      'pending:m-ada',
    ])
  })

  it('records that the member opened Matches (R-MINE-4)', async () => {
    const marked: string[] = []
    const cockpit = createCockpit({
      store: {
        challenges: () => Promise.resolve([]),
        pendingIncoming: () => Promise.resolve(0),
        newConnections: () => Promise.resolve(0),
        markSeen: (m) => {
          marked.push(m)
          return Promise.resolve()
        },
      },
      followed: () => Promise.resolve([]),
    })

    await cockpit.seen('m-ada')

    expect(marked).toEqual(['m-ada'])
  })
})
