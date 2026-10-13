// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { showScreen, showUnread, tabTitle } from './tab-title'

describe('tabTitle (R-NAV-13, R-NOTE-6)', () => {
  it('leads with the number of new notifications', () => {
    expect(tabTitle('Your matches', 3)).toBe('(3) Rebel Match | Your matches')
  })

  it('shows no number with nothing new', () => {
    expect(tabTitle('Your matches', 0)).toBe('Rebel Match | Your matches')
  })
})

describe('the tab title as the app runs', () => {
  it('waits for a screen before writing, then keeps the count across moves', () => {
    document.title = 'Rebel Match'

    showUnread(2)
    expect(document.title).toBe('Rebel Match')

    showScreen('Welcome')
    expect(document.title).toBe('(2) Rebel Match | Welcome')

    showScreen('Offer help')
    expect(document.title).toBe('(2) Rebel Match | Offer help')

    showUnread(0)
    expect(document.title).toBe('Rebel Match | Offer help')
  })
})
