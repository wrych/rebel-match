import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  confirmTrend,
  fetchChallenge,
  fetchTrends,
  shownTrend,
  submitChallenge,
  type Challenge,
  type Trend,
} from './challenges'

const trends: Trend[] = [
  { id: '01', short: 'Purpose & Values', from: 'Profit', peers: 12 },
  { id: '02', short: 'Network of Teams', from: 'Pyramid', peers: 34 },
  { id: '03', short: 'Radical Transparency', from: 'Secrecy', peers: 5 },
]

const challenge: Challenge = {
  id: 'c1',
  memberId: 'm1',
  body: 'Nobody here knows who can decide what, and it hurts.',
  trendId: null,
  autoTrend: '02',
  overridden: false,
  createdAt: '2026-10-03T09:00:00.000Z',
}

function answer(status: number, body: unknown = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status < 300,
    status,
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shownTrend', () => {
  it('shows the matcher’s trend before anything is confirmed (R-ASK-6)', () => {
    expect(shownTrend(trends, challenge, null)?.id).toBe('02')
  })

  it('prefers the confirmed trend over the matcher’s', () => {
    expect(shownTrend(trends, { ...challenge, trendId: '01' }, null)?.id).toBe(
      '01',
    )
  })

  it('prefers a trend picked on the trend screen (R-ASK-6)', () => {
    expect(shownTrend(trends, challenge, '03')?.id).toBe('03')
  })

  it('ignores a picked id that is no trend', () => {
    expect(shownTrend(trends, challenge, '99')?.id).toBe('02')
  })

  it('is null when no trend is known', () => {
    expect(shownTrend([], challenge, null)).toBeNull()
  })
})

describe('the challenge API calls', () => {
  it('reads the trends', async () => {
    answer(200, { trends })

    expect(await fetchTrends()).toEqual(trends)
  })

  it('throws when the trends cannot be read', async () => {
    answer(500)

    await expect(fetchTrends()).rejects.toThrow('500')
  })

  it('posts the text and returns the saved challenge (R-ASK-4)', async () => {
    const fetchMock = answer(201, { challenge })

    expect(await submitChallenge(challenge.body)).toEqual(challenge)
    expect(fetchMock).toHaveBeenCalledWith('/api/challenges', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: challenge.body }),
    })
  })

  it('throws when the challenge is refused', async () => {
    answer(400)

    await expect(submitChallenge('too short')).rejects.toThrow('400')
  })

  it('reads the member’s own challenge', async () => {
    answer(200, { challenge })

    expect(await fetchChallenge('c1')).toEqual(challenge)
  })

  it('is null for a challenge that is not theirs (R-NAV-8)', async () => {
    answer(404)

    expect(await fetchChallenge('c2')).toBeNull()
  })

  it('throws when the challenge cannot be read', async () => {
    answer(500)

    await expect(fetchChallenge('c1')).rejects.toThrow('500')
  })

  it('stores the confirmed trend (R-ASK-7)', async () => {
    const fetchMock = answer(204)

    await confirmTrend('c1', '03')

    expect(fetchMock).toHaveBeenCalledWith('/api/challenges/c1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trendId: '03' }),
    })
  })

  it('throws when the trend is not saved', async () => {
    answer(400)

    await expect(confirmTrend('c1', '99')).rejects.toThrow('400')
  })
})
