import { describe, expect, it } from 'vitest'
import { holds, searchTerm, useFolds } from './folds'

describe('searchTerm (R-CFG-5, R-PROF-8)', () => {
  it('is nothing until the search holds three characters', () => {
    expect(searchTerm('  ab ')).toBeNull()
    expect(searchTerm(' AbC ')).toBe('abc')
  })

  it('matches ignoring case', () => {
    expect(holds('Happy colour mode', 'colour')).toBe(true)
    expect(holds('Happy colour mode', 'color')).toBe(false)
  })
})

describe('useFolds (R-CFG-5, R-PROF-8)', () => {
  it('opens every card while searching and nothing before', () => {
    const folds = useFolds()
    expect(folds.isOpen('Look')).toBe(false)

    folds.search.value = 'colour'

    expect(folds.searching.value).toBe(true)
    expect(folds.isOpen('Look')).toBe(true)
  })

  it('folds back as the member left it once the search is cleared', () => {
    const folds = useFolds()
    folds.remember('About you', true)
    folds.search.value = 'colour'
    folds.remember('About you', false)
    folds.remember('Look', true)

    folds.search.value = ''

    expect(folds.isOpen('About you')).toBe(true)
    expect(folds.isOpen('Look')).toBe(false)
  })
})
