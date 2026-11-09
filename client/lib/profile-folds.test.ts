import { describe, expect, it } from 'vitest'
import { profileFolds, searchProfile } from './profile-folds'

const all = profileFolds({ socialLinks: true, codes: true })

describe('searchProfile (R-PROF-8)', () => {
  it('shows every card until the search holds three characters', () => {
    expect(searchProfile(all, 'ab')).toEqual(all.map((fold) => fold.title))
  })

  it('finds a card by its title or the words of what it holds', () => {
    expect(searchProfile(all, 'PRIVACY')).toEqual(['Privacy'])
    expect(searchProfile(all, 'linkedin')).toEqual(['Connecting'])
    expect(searchProfile(all, 'your code')).toEqual(['Connecting'])
    expect(searchProfile(all, 'email')).toEqual(['About you', 'Notifications'])
  })

  it('finds nothing by words of what hosts have off', () => {
    const plain = profileFolds({ socialLinks: false, codes: false })

    expect(searchProfile(plain, 'linkedin')).toEqual([])
    expect(searchProfile(plain, 'profile code')).toEqual([])
  })
})
