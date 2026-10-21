import { describe, expect, it } from 'vitest'
import {
  byAttention,
  createModeration,
  type ItemReport,
  type ModerationItem,
} from './moderation.js'

function report(open: boolean, at: string): ItemReport {
  return { reason: 'spam', comment: null, at, reporter: 'Mia', open }
}

function item(id: string, reports: ItemReport[]): ModerationItem {
  return {
    kind: 'challenge',
    id,
    body: 'Buy my course.',
    trendShort: null,
    sentTo: null,
    state: 'shown',
    hiddenReason: null,
    reports,
  }
}

describe('byAttention (R-MOD-7)', () => {
  it('puts open reports first, then the most reported, then the latest', () => {
    const handled = item('handled', [
      report(false, '2026-11-08T12:00:00Z'),
      report(false, '2026-11-08T12:00:00Z'),
      report(false, '2026-11-08T12:00:00Z'),
    ])
    const oneOpen = item('one-open', [report(true, '2026-11-08T09:00:00Z')])
    const twoOpen = item('two-open', [
      report(true, '2026-11-08T08:00:00Z'),
      report(true, '2026-11-08T08:00:00Z'),
    ])
    const laterOpen = item('later-open', [report(true, '2026-11-08T10:00:00Z')])

    const order = [handled, oneOpen, twoOpen, laterOpen]
      .sort(byAttention)
      .map((each) => each.id)

    expect(order).toEqual(['two-open', 'later-open', 'one-open', 'handled'])
  })
})

describe('createModeration (R-MOD-7)', () => {
  it('dismisses through the store, not found when nothing was open', async () => {
    const dismissed: string[] = []
    const moderation = createModeration({
      overview: () => Promise.resolve([]),
      page: () => Promise.resolve(null),
      dismiss: (item, actorId) => {
        dismissed.push(actorId)
        return Promise.resolve('requestId' in item)
      },
    })

    expect(await moderation.dismiss({ requestId: 'r-1' }, 'm-host')).toBe(
      'dismissed',
    )
    expect(await moderation.dismiss({ challengeId: 'c-1' }, 'm-host')).toBe(
      'not_found',
    )
    expect(dismissed).toEqual(['m-host', 'm-host'])
  })
})
