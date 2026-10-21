import { describe, expect, it } from 'vitest'
import { afterNavigation, thankOnReturn, thanks } from './thanks'

describe('thanks (R-MOD-4)', () => {
  it('shows on the screen the next navigation lands on, and goes with the one after', () => {
    thankOnReturn('Thanks, a host will look at it.')
    afterNavigation()

    expect(thanks.value).toBe('Thanks, a host will look at it.')

    afterNavigation()

    expect(thanks.value).toBeNull()
  })

  it('stays empty when nothing was said', () => {
    afterNavigation()

    expect(thanks.value).toBeNull()
  })
})
