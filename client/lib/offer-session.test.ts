// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { countAnswer, readTally, tallyLine } from './offer-session'

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('the offer tally (R-OFF-5)', () => {
  it('starts at zero and counts each kind', () => {
    expect(readTally()).toEqual({ sameBoat: 0, beenThere: 0, follows: 0 })

    countAnswer('sameBoat')
    countAnswer('sameBoat')
    countAnswer('follows')

    expect(readTally()).toEqual({ sameBoat: 2, beenThere: 0, follows: 1 })
  })

  it('reads anything malformed as zero', () => {
    sessionStorage.setItem('rm_offer_tally', '{"sameBoat":"lots","follows":-3}')

    expect(readTally()).toEqual({ sameBoat: 0, beenThere: 0, follows: 0 })
    sessionStorage.setItem('rm_offer_tally', 'not json')
    expect(readTally()).toEqual({ sameBoat: 0, beenThere: 0, follows: 0 })
  })

  it('counts zero when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(() => countAnswer('beenThere')).not.toThrow()
    expect(readTally()).toEqual({ sameBoat: 0, beenThere: 0, follows: 0 })
  })

  it('words the summary, singular and plural', () => {
    expect(tallyLine({ sameBoat: 1, beenThere: 2, follows: 0 })).toBe(
      '1 same-boat match · 2 offers sent · 0 topics followed',
    )
  })
})
