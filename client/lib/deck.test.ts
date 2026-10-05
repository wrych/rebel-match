import { afterEach, describe, expect, it, vi } from 'vitest'
import { answerCard, authorLine, fetchDeck, type DeckCard } from './deck'

const card: DeckCard = {
  challengeId: 'c1',
  body: 'Two shifts, two cultures.',
  trend: { id: '02', short: 'Network of Teams' },
  author: {
    name: 'Ola Nyberg',
    jobTitle: 'Site manager',
    org: 'Björk',
    sector: null,
    companySize: null,
  },
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

describe('fetchDeck', () => {
  it('reads the next cards (R-OFF-1)', async () => {
    answer(200, { cards: [card] })

    expect(await fetchDeck()).toEqual([card])
  })

  it('throws when the deck cannot be read', async () => {
    answer(500)

    await expect(fetchDeck()).rejects.toThrow('500')
  })
})

describe('answerCard', () => {
  it('posts the answer with its note (R-OFF-3,4)', async () => {
    const fetchMock = answer(201, {
      result: 'recorded',
      connection: { result: 'created', id: 'r1' },
    })

    expect(await answerCard('c1', 'been_there', 'We did this.')).toEqual({
      result: 'recorded',
      request: 'created',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/swipe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: 'c1',
        action: 'been_there',
        note: 'We did this.',
      }),
    })
  })

  it('reads an answer without a request as recorded', async () => {
    answer(201, { result: 'recorded' })

    expect(await answerCard('c1', 'skip')).toEqual({ result: 'recorded' })
  })

  it('reads a card no longer open as gone', async () => {
    answer(404)

    expect(await answerCard('c1', 'follow')).toEqual({ result: 'gone' })
  })

  it('throws on anything else', async () => {
    answer(500)

    await expect(answerCard('c1', 'skip')).rejects.toThrow('500')
  })
})

describe('authorLine', () => {
  it('joins organization, sector and company size, leaving out what is missing', () => {
    expect(authorLine(card)).toBe('Björk')
    expect(
      authorLine({
        ...card,
        author: { ...card.author, sector: 'Manufacturing', companySize: null },
      }),
    ).toBe('Björk · Manufacturing')
    expect(
      authorLine({
        ...card,
        author: {
          ...card.author,
          sector: 'Software & technology',
          companySize: '251–1,000 employees',
        },
      }),
    ).toBe('Björk · Software & technology · 251–1,000 employees')
  })
})
