import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  confirmTrend,
  fetchChallenge,
  fetchMatches,
  fetchTrendDetail,
  fetchTrends,
  moreMatches,
  peerLine,
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

describe('peerLine', () => {
  const peer = {
    memberId: 'm2',
    name: 'Bo',
    jobTitle: 'Coach',
    org: 'Buurtzorg',
    sector: 'Healthcare',
    companySize: '1,001+ employees',
    note: 'Teams of 12.',
  }

  it('joins job title, organization, sector and company size', () => {
    expect(peerLine(peer)).toBe(
      'Coach · Buurtzorg · Healthcare · 1,001+ employees',
    )
  })

  it('leaves out what the peer did not give', () => {
    expect(
      peerLine({ ...peer, jobTitle: null, sector: '', companySize: null }),
    ).toBe('Buurtzorg')
  })
})

describe('fetchMatches', () => {
  it('reads the matches for the member’s own challenge (R-ASK-8)', async () => {
    const matches = { trend: trends[0], sameBoat: [], beenThere: [], cases: [] }
    const fetchMock = answer(200, matches)

    expect(await fetchMatches('c1')).toEqual(matches)
    expect(fetchMock).toHaveBeenCalledWith('/api/challenges/c1/matches')
  })

  it('is null for a challenge that is not theirs (R-NAV-8)', async () => {
    answer(404)

    expect(await fetchMatches('c2')).toBeNull()
  })

  it('throws when the matches cannot be read', async () => {
    answer(500)

    await expect(fetchMatches('c1')).rejects.toThrow('500')
  })
})

describe('fetchTrendDetail', () => {
  it('reads one trend with its cases (design S9)', async () => {
    const detail = { trend: trends[0], cases: [] }
    const fetchMock = answer(200, detail)

    expect(await fetchTrendDetail('01')).toEqual(detail)
    expect(fetchMock).toHaveBeenCalledWith('/api/trends/01')
  })

  it('is null for an id that is no trend', async () => {
    answer(404)

    expect(await fetchTrendDetail('99')).toBeNull()
  })

  it('throws when the trend cannot be read', async () => {
    answer(500)

    await expect(fetchTrendDetail('01')).rejects.toThrow('500')
  })
})

describe('moreMatches', () => {
  it.each([
    ['sameBoat', 3, '3 more rebels in the same boat'],
    ['sameBoat', 1, '1 more rebel in the same boat'],
    ['beenThere', 2, '2 more who’ve been there'],
    ['beenThere', 1, '1 more who’ve been there'],
    ['cases', 4, '4 more case studies'],
    ['cases', 1, '1 more case study'],
  ] as const)('names %s ×%i as “%s” (R-ASK-15)', (section, count, label) => {
    expect(moreMatches(section, count)).toBe(label)
  })
})
