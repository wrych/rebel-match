import { describe, expect, it } from 'vitest'
import {
  companySizeKeys,
  companySizeLabel,
  companySizes,
  pickedOrBlank,
  sectors,
} from './profile-options.js'

describe('company sizes', () => {
  it('offer at most five bands (R-ONB-2)', () => {
    expect(companySizes.length).toBeLessThanOrEqual(5)
  })

  it('read as employees on a card', () => {
    expect(companySizeLabel('11-50')).toBe('11–50 employees')
    expect(companySizeLabel('1001+')).toBe('1,001+ employees')
  })

  it('read as nothing for none or a key not on the list', () => {
    expect(companySizeLabel(null)).toBeNull()
    expect(companySizeLabel('260')).toBeNull()
  })
})

describe('pickedOrBlank', () => {
  it('keeps a value on the list and blanks one that is not', () => {
    expect(pickedOrBlank('Retail', sectors)).toBe('Retail')
    expect(pickedOrBlank('Software · 260', sectors)).toBe('')
    expect(pickedOrBlank(null, companySizeKeys)).toBe('')
  })
})
