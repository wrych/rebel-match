// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makers } from '../lib/makers'
import { applyMood } from '../lib/mood'
import ImpressumScreen from './ImpressumScreen.vue'

const SWIPE_MIN_PX = 50

async function mountScreen(
  doorOpen = false,
): Promise<ReturnType<typeof mount>> {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === '/api/game/door'
          ? { ok: doorOpen, status: doorOpen ? 204 : 404 }
          : {
              ok: true,
              status: 200,
              json: async () => ({ limits: { swipeMinPx: SWIPE_MIN_PX } }),
            },
      ),
    ),
  )
  const screen = mount(ImpressumScreen, {
    attachTo: document.body,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

async function toTheEnd(screen: ReturnType<typeof mount>): Promise<void> {
  const next = screen.find('[aria-label="Next maker"]')
  for (let shown = 0; shown < makers.length + 1; shown += 1)
    await next.trigger('click')
  await flushPromises()
}

function shownName(screen: ReturnType<typeof mount>): string {
  return screen.find('.deck-text').text()
}

afterEach(() => {
  vi.unstubAllGlobals()
  applyMood('calm')
  localStorage.clear()
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

  it('shows initials for a card without a portrait', async () => {
    const screen = await mountScreen()
    const next = screen.find('[aria-label="Next maker"]')

    for (let shown = 1; shown < makers.length; shown += 1)
      await next.trigger('click')

    expect(shownName(screen)).toBe('Community')
    expect(screen.find('img.portrait').exists()).toBe(false)
    expect(screen.find('.portrait-initials').text()).toBe('C')
  })

  it('ends with the door to 9toRevolution in happy mode while it is open (R-GAME-1)', async () => {
    applyMood('happy')
    const screen = await mountScreen(true)
    await toTheEnd(screen)

    expect(shownName(screen)).toBe('9toRevolution')
    expect(screen.findComponent(RouterLinkStub).props('to')).toBe(
      '/9torevolution',
    )
    expect(screen.text()).toContain('Be a rebel')
  })

  it('has no door in calm mode, nor while the game is off', async () => {
    const calm = await mountScreen(true)
    await toTheEnd(calm)
    expect(shownName(calm)).toBe('Community')
    calm.unmount()

    applyMood('happy')
    const off = await mountScreen(false)
    await toTheEnd(off)
    expect(shownName(off)).toBe('Community')
  })

  it('closes the door when the member switches back to calm on it', async () => {
    applyMood('happy')
    const screen = await mountScreen(true)
    await toTheEnd(screen)

    applyMood('calm')
    await flushPromises()

    expect(shownName(screen)).toBe('Community')
  })

  it('keeps the door shut in calm mode when its answer comes late', async () => {
    applyMood('happy')
    let answer: (value: unknown) => void = () => undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/game/door'
          ? new Promise((resolve) => {
              answer = resolve
            })
          : Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ limits: { swipeMinPx: SWIPE_MIN_PX } }),
            }),
      ),
    )
    const screen = mount(ImpressumScreen, {
      attachTo: document.body,
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    applyMood('calm')
    answer({ ok: true, status: 204 })
    await flushPromises()
    await toTheEnd(screen)

    expect(shownName(screen)).toBe('Community')
  })
})
