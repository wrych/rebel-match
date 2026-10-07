// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameDefaults } from '../../src/game/tuning'
import { applyMood } from '../lib/mood'
import PlayView from './PlayView.vue'

const { enabled: _enabled, ...tuning } = gameDefaults
let frames: FrameRequestCallback[] = []
const beacon = vi.fn(() => true)
let now = 0

function frame(seconds = 0.1): void {
  now += seconds * 1000
  const due = frames
  frames = []
  for (const callback of due) callback(now)
}

function mountView(level = 1): ReturnType<typeof mount> {
  return mount(PlayView, {
    props: { level, seed: 1, tuning: { ...tuning, dayLengthSeconds: 30 } },
    attachTo: document.body,
  })
}

beforeEach(() => {
  frames = []
  now = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  beacon.mockClear()
  Object.defineProperty(navigator, 'sendBeacon', {
    value: beacon,
    configurable: true,
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  Object.assign(window, { innerWidth: 844, innerHeight: 390 })
  applyMood('happy')
})

afterEach(() => {
  applyMood('calm')
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('PlayView (R-GAME-12)', () => {
  it('shows the clock, the day and the office’s state', async () => {
    const view = mountView()
    frame()
    await flushPromises()

    expect(document.body.textContent).toContain('09:0')
    expect(document.body.textContent).toContain('Team Lead · day 1')
    expect(document.body.textContent).toContain('Rebels')
    view.unmount()
  })

  it('offers what can be done where the player stands, and does it on a press', async () => {
    const view = mountView()
    frame()
    await flushPromises()
    const button = document.querySelector<HTMLButtonElement>('.action-lit')

    expect(button?.textContent?.trim()).toBe('Take file')
    button?.click()
    frame()
    await flushPromises()
    expect(document.querySelector('.action-lit')).toBeNull()
    view.unmount()
  })

  it('pauses on Escape, and leaves the office from the pause', async () => {
    const view = mountView()
    frame()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
    await flushPromises()

    expect(document.body.textContent).toContain('Paused')
    const clock = document.querySelector('.hud .mono')?.textContent
    frame(5)
    await flushPromises()
    expect(document.querySelector('.hud .mono')?.textContent).toBe(clock)
    document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.textContent?.includes('Leave')) button.click()
    })
    expect(view.emitted('leave')).toHaveLength(1)
    view.unmount()
  })

  it('asks for the phone to be turned, and stands still meanwhile', async () => {
    Object.assign(window, { innerWidth: 390, innerHeight: 844 })
    const view = mountView()
    frame()
    await flushPromises()

    expect(document.body.textContent).toContain('Turn your phone')
    view.unmount()
  })

  it('ends the day at 17:00 and says how it went', async () => {
    const view = mountView()
    for (let i = 0; i < 160; i += 1) frame(0.25)
    await flushPromises()

    expect(view.emitted('ended')?.[0]).toEqual([
      expect.objectContaining({ outcome: 'won', seconds: 30 }),
    ])
    view.unmount()
  })

  it('opens the floor map', async () => {
    const view = mountView()
    document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.textContent?.trim() === 'Map') button.click()
    })
    await flushPromises()

    expect(document.querySelector('[aria-label="Floor map"]')).not.toBeNull()
    view.unmount()
  })

  it('lets go of every key when the window loses focus', async () => {
    const view = mountView()
    frame()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }))
    window.dispatchEvent(new Event('blur'))
    frame(2)
    await flushPromises()

    expect(document.querySelector('.action-lit')?.textContent?.trim()).toBe(
      'Take file',
    )
    view.unmount()
  })

  it('chooses grey colleagues for a masterclass at the player’s desk, and sends them', async () => {
    const view = mount(PlayView, {
      props: {
        level: 16,
        seed: 1,
        tuning: { ...tuning, dayLengthSeconds: 300, 'rebel.morningGrey': 3 },
      },
      attachTo: document.body,
    })
    for (let i = 0; i < 80; i += 1) frame(0.25)
    await flushPromises()
    const button = document.querySelector<HTMLButtonElement>('.action-lit')
    expect(button?.textContent?.trim()).toBe('Masterclass')

    button?.click()
    await flushPromises()
    const desks = [...document.querySelectorAll<HTMLButtonElement>('.grey')]
    expect(desks).toHaveLength(3)
    expect(document.activeElement).toBe(desks[0])
    desks[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    )
    expect(document.activeElement).toBe(desks[1])
    desks[0]?.click()
    await flushPromises()
    expect(desks[0]?.getAttribute('aria-pressed')).toBe('true')
    document.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      if (b.textContent?.includes('Send to the masterclass')) b.click()
    })
    frame()
    await flushPromises()

    expect(document.querySelector('[aria-label="Masterclass"]')).toBeNull()
    expect(document.querySelector('.action-lit')).toBeNull()
    view.unmount()
  })

  it('stands still in calm mode, and carries on in happy mode (R-GAME-1)', async () => {
    const view = mountView()
    frame()
    applyMood('calm')
    await flushPromises()
    const clock = document.querySelector('.hud .mono')?.textContent

    frame(5)
    await flushPromises()
    expect(document.body.textContent).toContain('only come out in happy mode')
    expect(document.querySelector('.hud .mono')?.textContent).toBe(clock)
    applyMood('happy')
    frame(5)
    await flushPromises()
    expect(document.querySelector('.hud .mono')?.textContent).not.toBe(clock)
    view.unmount()
  })

  it('takes no action from a key pressed while paused', async () => {
    const view = mountView()
    frame()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
    frame()
    await flushPromises()

    expect(document.querySelector('.action-lit')?.textContent?.trim()).toBe(
      'Take file',
    )
    view.unmount()
  })

  it('records a day left unfinished when the page goes away (R-GAME-14)', async () => {
    const view = mountView()
    for (let i = 0; i < 20; i += 1) frame(0.25)
    window.dispatchEvent(new Event('pagehide'))
    view.unmount()

    expect(beacon).toHaveBeenCalledTimes(1)
    expect(beacon).toHaveBeenCalledWith('/api/game/days', expect.any(Blob))
  })

  it('sends nothing on its own once the day was left or ended', async () => {
    const view = mountView()
    frame()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
    await flushPromises()
    document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.textContent?.includes('Leave')) button.click()
    })
    view.unmount()

    expect(beacon).not.toHaveBeenCalled()
  })
})
