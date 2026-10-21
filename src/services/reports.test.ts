import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent, Track } from './analytics.js'
import {
  createReports,
  type ReportOutcome,
  type ReportStore,
  type ReportTarget,
} from './reports.js'

const target: ReportTarget = {
  kind: 'challenge',
  body: 'Buy my course.',
  trendShort: 'DDM',
  alreadyReported: false,
}

function setup(outcome: ReportOutcome = 'reported'): {
  service: ReturnType<typeof createReports>
  recorded: Parameters<ReportStore['record']>[0][]
  asked: string[]
  tracked: [string, AnalyticsEvent][]
} {
  const recorded: Parameters<ReportStore['record']>[0][] = []
  const asked: string[] = []
  const tracked: [string, AnalyticsEvent][] = []
  const store: ReportStore = {
    challengeTarget: (reporterId, id) => {
      asked.push(`challenge ${reporterId} ${id}`)
      return Promise.resolve(target)
    },
    noteTarget: (reporterId, id) => {
      asked.push(`note ${reporterId} ${id}`)
      return Promise.resolve(null)
    },
    record: (report) => {
      recorded.push(report)
      return Promise.resolve(outcome)
    },
  }
  const track: Track = (memberId, event) => {
    tracked.push([memberId, event])
    return Promise.resolve()
  }
  return {
    service: createReports({ store, perDay: () => 7, track }),
    recorded,
    asked,
    tracked,
  }
}

describe('createReports (R-MOD-1..4)', () => {
  it('reads a challenge or a note as the reporter may see it', async () => {
    const { service, asked } = setup()

    expect(await service.target('m-ada', { challengeId: 'c-1' })).toEqual(
      target,
    )
    expect(await service.target('m-ada', { requestId: 'r-1' })).toBeNull()
    expect(asked).toEqual(['challenge m-ada c-1', 'note m-ada r-1'])
  })

  it('records a report under the configured daily cap', async () => {
    const { service, recorded } = setup()

    const outcome = await service.report(
      'm-ada',
      { item: { requestId: 'r-1' }, reason: 'inappropriate', comment: null },
      () => 'rep-1',
    )

    expect(outcome).toBe('reported')
    expect(recorded).toEqual([
      {
        id: 'rep-1',
        reporterId: 'm-ada',
        item: { requestId: 'r-1' },
        reason: 'inappropriate',
        comment: null,
        perDay: 7,
      },
    ])
  })

  it('reports a report as usage by its kind and reason only (R-MOD-12, R-ANA-3)', async () => {
    const { service, tracked } = setup()

    await service.report(
      'm-ada',
      {
        item: { challengeId: 'c-1' },
        reason: 'spam',
        comment: 'Mara keeps pitching.',
      },
      () => 'rep-1',
    )

    expect(tracked).toEqual([
      [
        'm-ada',
        { name: 'content_reported', kind: 'challenge', reason: 'spam' },
      ],
    ])
  })

  it.each<ReportOutcome>(['not_found', 'already_reported', 'too_many'])(
    'reports no usage when the report is %s',
    async (outcome) => {
      const { service, tracked } = setup(outcome)

      expect(
        await service.report(
          'm-ada',
          { item: { challengeId: 'c-1' }, reason: 'other', comment: null },
          () => 'rep-1',
        ),
      ).toBe(outcome)
      expect(tracked).toEqual([])
    },
  )
})
