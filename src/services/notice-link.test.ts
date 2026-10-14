import { describe, expect, it } from 'vitest'
import { noticeLink } from './notice-link.js'

describe('noticeLink (R-ANA-1)', () => {
  it('marks a link with its notification’s kind, beside any query it has', () => {
    expect(
      noticeLink(
        'https://match.example.invalid',
        '/matches/requests/r-1',
        'connection_request',
      ),
    ).toBe(
      'https://match.example.invalid/matches/requests/r-1?notice=connection_request',
    )
    expect(
      noticeLink(
        'http://localhost:5173/',
        '/offer?challenge=c1',
        'trend_challenge',
      ),
    ).toBe('http://localhost:5173/offer?challenge=c1&notice=trend_challenge')
  })
})
