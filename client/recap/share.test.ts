// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { paletteOfPage } from './share'

describe('the card’s palette', () => {
  it('reads the page’s colours, with the app’s own as fallbacks', () => {
    document.documentElement.style.setProperty('--accent', '#ff2e93')

    const palette = paletteOfPage(document.documentElement)

    expect(palette.accent).toBe('#ff2e93')
    expect(palette.paper).toBe('#faf8f4')
  })
})
