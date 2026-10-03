// @vitest-environment jsdom
import { mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OfferDoneScreen from './OfferDoneScreen.vue'

function mountScreen(): ReturnType<typeof mount> {
  return mount(OfferDoneScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
    attachTo: document.body,
  })
}

afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('OfferDoneScreen', () => {
  it('sums up the session and invites the member to ask (R-OFF-5)', () => {
    sessionStorage.setItem(
      'rm_offer_tally',
      JSON.stringify({ sameBoat: 2, beenThere: 1, follows: 0 }),
    )
    const screen = mountScreen()

    expect(screen.text()).toContain(
      '2 same-boat matches · 1 offer sent · 0 topics followed',
    )
    expect(screen.findComponent(RouterLinkStub).props('to')).toBe('/ask')
  })

  it('turns up Trend 0 — Trust on one more tap, and focuses it (R-OFF-6)', async () => {
    const screen = mountScreen()
    await screen.find('.empty-card').trigger('click')

    const trust = screen.find('.trust')
    expect(trust.text()).toContain('Trust')
    expect(trust.text()).toContain('Rules → Trust')
    expect(trust.text()).toContain('everyone in the room')
    expect(trust.text()).toContain('Corporate Rebels bucket list')
    expect(document.activeElement).toBe(trust.element)
  })

  it('turns it up by keyboard too, and lets it be dismissed', async () => {
    const screen = mountScreen()
    await screen.find('.empty-card').trigger('keydown', { key: 'ArrowRight' })
    expect(screen.find('.trust').exists()).toBe(true)

    await screen.find('.trust button').trigger('click')
    expect(screen.find('.trust').exists()).toBe(false)
    expect(document.activeElement).toBe(screen.find('.empty-card').element)
  })

  it('records nothing: no request, swipe or follow (R-OFF-6)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const screen = mountScreen()
    await screen.find('.empty-card').trigger('click')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the call to ask in view while Trust shows', async () => {
    const screen = mountScreen()
    await screen.find('.empty-card').trigger('click')

    expect(screen.findComponent(RouterLinkStub).text()).toBe(
      'Submit your challenge',
    )
  })
})
