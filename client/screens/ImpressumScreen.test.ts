// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makers } from '../lib/makers'
import ImpressumScreen from './ImpressumScreen.vue'

const SWIPE_MIN_PX = 50

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ limits: { swipeMinPx: SWIPE_MIN_PX } }),
    }),
  )
  const screen = mount(ImpressumScreen, { attachTo: document.body })
  await flushPromises()
  return screen
}

function shownName(screen: ReturnType<typeof mount>): string {
  return screen.find('.deck-text').text()
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('ImpressumScreen', () => {
  it('shows the first maker with what they are responsible for (R-PROF-4)', async () => {
    const screen = await mountScreen()

    expect(shownName(screen)).toBe('Pascal Dulex')
    expect(screen.find('.mono').text()).toBe('Idea · Design · Marketing')
    expect(screen.find('img.portrait').attributes('alt')).toBe(
      'Portrait of Pascal Dulex',
    )
  })

  it('browses the makers with the arrows, as the swipe deck does', async () => {
    const screen = await mountScreen()

    await screen.find('[aria-label="Next maker"]').trigger('click')
    expect(shownName(screen)).toBe(makers[1]?.name)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await flushPromises()
    expect(shownName(screen)).toBe('Pascal Dulex')
  })

  it('browses the makers with a swipe across the card', async () => {
    const screen = await mountScreen()
    const at = (x: number): Touch[] =>
      [{ clientX: x, clientY: 300 }] as unknown as Touch[]

    const card = screen.find('.deck-card')
    await card.trigger('touchstart', { touches: at(200) })
    await card.trigger('touchend', { changedTouches: at(200 - SWIPE_MIN_PX) })

    expect(shownName(screen)).toBe(makers[1]?.name)
  })

  it('shows initials for a maker without a portrait', async () => {
    const screen = await mountScreen()

    await screen.find('[aria-label="Next maker"]').trigger('click')

    expect(screen.find('img.portrait').exists()).toBe(false)
    expect(screen.find('.portrait-initials').text()).toBe('IP')
  })
})
