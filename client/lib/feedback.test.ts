import { describe, expect, it } from 'vitest'
import { feedbackMailto } from './feedback'

describe('feedbackMailto', () => {
  it('mails the owner with the screen filled in (R-FB-1)', () => {
    const url = new URL(feedbackMailto('owner@example.org', 'matches'))

    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe('owner@example.org')
    expect(url.searchParams.get('subject')).toBe('Rebel Match — feedback')
    expect(url.searchParams.get('body')).toContain('Screen: matches')
  })
})
