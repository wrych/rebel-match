// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cardMotion } from '../lib/swipe'
import CardDeck from './CardDeck.vue'

const SWIPE_MIN_PX = 50
const START = 200
let reducedMotion = false

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') && reducedMotion,
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ limits: { swipeMinPx: SWIPE_MIN_PX } }),
      }),
    ),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  reducedMotion = false
  document.body.innerHTML = ''
})

async function mountDeck(index = 0): Promise<ReturnType<typeof mount>> {
  const deck = mount(CardDeck, {
    props: { index, count: 3, noun: 'card' },
    slots: { default: '<p>card</p>' },
    attachTo: document.body,
  })
  await flushPromises()
  return deck
}

function at(x: number, y = 300): Touch[] {
  return [{ clientX: x, clientY: y }] as unknown as Touch[]
}

async function drag(
  deck: ReturnType<typeof mount>,
  across: number,
  down = 0,
): Promise<void> {
  const card = deck.find('.deck-card')
  await card.trigger('touchstart', { touches: at(START) })
  await card.trigger('touchmove', { touches: at(START + across, 300 + down) })
}

async function release(
  deck: ReturnType<typeof mount>,
  across: number,
): Promise<void> {
  await deck
    .find('.deck-card')
    .trigger('touchend', { changedTouches: at(START + across) })
}

function transform(deck: ReturnType<typeof mount>): string {
  return deck.find<HTMLElement>('.deck-card').element.style.transform
}

async function landed(): Promise<void> {
  vi.advanceTimersByTime(cardMotion.flyOutMs)
  await flushPromises()
}

describe('CardDeck motion (R-OFF-1)', () => {
  it('moves and tilts the card with a sideways drag', async () => {
    const deck = await mountDeck()

    await drag(deck, -30)

    expect(transform(deck)).toMatch(/translateX\(-30px\) rotate\(-[\d.]+deg\)/)
  })

  it('leaves the card in place for a mostly vertical drag', async () => {
    const deck = await mountDeck()

    await drag(deck, -10, -60)

    expect(transform(deck)).toBe('')
  })

  it('flies the card off past the threshold, then browses', async () => {
    const deck = await mountDeck()

    await drag(deck, -SWIPE_MIN_PX)
    await release(deck, -SWIPE_MIN_PX)

    expect(transform(deck)).toContain(`translateX(-${window.innerWidth}px)`)
    expect(deck.emitted('browse')).toBeUndefined()
    await landed()
    expect(deck.emitted('browse')).toEqual([[1]])
    expect(transform(deck)).toBe('')
  })

  it('springs back below the threshold without browsing', async () => {
    const deck = await mountDeck()

    await drag(deck, -(SWIPE_MIN_PX - 1))
    await release(deck, -(SWIPE_MIN_PX - 1))
    await landed()

    expect(deck.emitted('browse')).toBeUndefined()
    expect(transform(deck)).toBe('')
  })

  it('springs back from a swipe past the last card', async () => {
    const deck = await mountDeck(2)

    await drag(deck, -SWIPE_MIN_PX * 2)
    await release(deck, -SWIPE_MIN_PX * 2)
    await landed()

    expect(deck.emitted('browse')).toBeUndefined()
    expect(transform(deck)).toBe('')
  })

  it('flies the card off for the arrows too, one card at a time', async () => {
    const deck = await mountDeck(1)

    await deck.find('[aria-label="Previous card"]').trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))

    expect(transform(deck)).toContain(`translateX(${window.innerWidth}px)`)
    await landed()
    expect(deck.emitted('browse')).toEqual([[0]])
  })

  it('switches cards at once and never follows the finger under reduced motion', async () => {
    reducedMotion = true
    const deck = await mountDeck()

    await drag(deck, -SWIPE_MIN_PX)
    expect(transform(deck)).toBe('')
    await release(deck, -SWIPE_MIN_PX)
    expect(deck.emitted('browse')).toEqual([[1]])
    await deck.find('[aria-label="Next card"]').trigger('click')
    expect(deck.emitted('browse')).toEqual([[1], [1]])
  })

  it('lets a touch during the flight neither stop nor repeat it', async () => {
    const deck = await mountDeck()

    await deck.find('[aria-label="Next card"]').trigger('click')
    await drag(deck, -SWIPE_MIN_PX)
    await release(deck, -SWIPE_MIN_PX)
    await deck.find('.deck-card').trigger('touchcancel')

    expect(transform(deck)).toContain(`translateX(-${window.innerWidth}px)`)
    await landed()
    expect(deck.emitted('browse')).toEqual([[1]])
  })

  it('leaves the card the parent moved to while the last one flew off', async () => {
    const deck = await mountDeck()

    await deck.find('[aria-label="Next card"]').trigger('click')
    await deck.setProps({ count: 2 })
    await landed()

    expect(deck.emitted('browse')).toBeUndefined()
    expect(transform(deck)).toBe('')
  })

  it('does not browse after it is gone', async () => {
    const deck = await mountDeck()

    await deck.find('[aria-label="Next card"]').trigger('click')
    deck.unmount()
    await landed()

    expect(deck.emitted('browse')).toBeUndefined()
  })
})
