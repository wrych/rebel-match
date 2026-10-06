// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { countInviteOpen } from './invite-open'

const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
  Promise.resolve({ ok: true, status: 204 }),
)

/** The invites the server was told were opened, in order. */
function reported(): string[] {
  return fetchMock.mock.calls.map(
    ([, init]) => (JSON.parse(String(init?.body)) as { invite: string }).invite,
  )
}

function press(type = 'pointerdown'): void {
  window.dispatchEvent(new Event(type))
}

describe('countInviteOpen (R-STAT-6, ADR 0039)', () => {
  let stop: () => void = () => undefined

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.clear()
  })

  afterEach(() => {
    stop()
    fetchMock.mockClear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('counts nothing on load, and once on the first press', () => {
    stop = countInviteOpen('poster-token')
    expect(reported()).toEqual([])

    press()
    press('keydown')

    expect(reported()).toEqual(['poster-token'])
  })

  it('counts a key as an interaction', () => {
    stop = countInviteOpen('poster-token')
    press('keydown')
    expect(reported()).toEqual(['poster-token'])
  })

  it('does not count a press while the tab is hidden', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    stop = countInviteOpen('poster-token')
    press()
    expect(reported()).toEqual([])
  })

  it('does not count in a browser that declares itself automated', () => {
    Object.defineProperty(navigator, 'webdriver', {
      configurable: true,
      get: () => true,
    })
    try {
      stop = countInviteOpen('poster-token')
      press()
      expect(reported()).toEqual([])
    } finally {
      Reflect.deleteProperty(navigator, 'webdriver')
    }
  })

  it('counts an invite once per tab, across loads', () => {
    countInviteOpen('poster-token')
    press()
    stop = countInviteOpen('poster-token')
    press()
    expect(reported()).toEqual(['poster-token'])
  })

  it('counts nothing once stopped', () => {
    countInviteOpen('poster-token')()
    press()
    expect(reported()).toEqual([])
  })
})
