import { describe, expect, it } from 'vitest'
import {
  companySizeKeys,
  companySizes,
  pickedOrBlank,
  sectorKeys,
} from './profile-options.js'

describe('company sizes', () => {
  it('offer at most five bands, each read as employees (R-ONB-2)', () => {
    expect(companySizes.length).toBeLessThanOrEqual(5)
    for (const size of companySizes) expect(size.label).toMatch(/ employees$/)
  })
})

describe('pickedOrBlank', () => {
  it('keeps a key on the list and blanks one that is not', () => {
    expect(pickedOrBlank('retail', sectorKeys)).toBe('retail')
    expect(pickedOrBlank('Software · 260', sectorKeys)).toBe('')
    expect(pickedOrBlank(null, companySizeKeys)).toBe('')
  })
})
