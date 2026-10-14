import { describe, expect, it } from 'vitest'
import { fromNotice } from './notice'

describe('fromNotice (R-ANA-1)', () => {
  it('reads the kind an emailed link came from, and keeps the rest of its query', () => {
    expect(fromNotice({ challenge: 'c1', notice: 'trend_challenge' })).toEqual({
      kind: 'trend_challenge',
      rest: { challenge: 'c1' },
    })
  })

  it('drops a mark of a kind there is not, without a kind', () => {
    expect(fromNotice({ notice: 'newsletter' })).toEqual({
      kind: null,
      rest: {},
    })
    expect(fromNotice({ notice: ['applicant', 'applicant'] })).toEqual({
      kind: null,
      rest: {},
    })
  })

  it('is null for a link without the mark', () => {
    expect(fromNotice({ challenge: 'c1' })).toBeNull()
  })
})
