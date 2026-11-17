import { describe, expect, it } from 'vitest'
import {
  cellChoice,
  cellLabel,
  cellOf,
  companySizeKeys,
  companySizes,
  pickedOrBlank,
  rebelCells,
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

describe('rebel cells', () => {
  it('give every cell a flag, and say who Global is for (R-PROF-9)', () => {
    for (const cell of rebelCells) expect(cell.flag).not.toBe('')
    const global = cellOf('global')
    expect(global && cellChoice(global)).toBe('🌐 Global (no country cell)')
    const swiss = cellOf('switzerland')
    expect(swiss && cellChoice(swiss)).toBe('🇨🇭 Switzerland')
  })

  it('name no cell for none or a key off the list', () => {
    expect(cellLabel('japan')).toBe('Rebel cell: Japan')
    expect(cellLabel('zurich')).toBe('')
    expect(cellOf(null)).toBeNull()
    expect(cellOf('zurich')).toBeNull()
  })
})
