// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ticker } from '../network/replay'
import type { StageState } from '../presentation/director'
import type { PresentationScript } from '../presentation/script'
import type { PresentationData } from '../presentation/world'
import PresentationStage from './PresentationStage.vue'

const data: PresentationData = {
  timeline: {
    nodes: [0, 1, 2].map((id) => ({
      id,
      at: id / 3,
      day: '2026-10-01',
      self: false,
    })),
    links: [{ source: 0, target: 1, at: 0.5, day: '2026-10-02' }],
    moons: [],
    own: null,
  },
  cast: [
    {
      handle: 'pioneer',
      name: 'Pia Pioneer',
      photo: null,
      groups: [],
      node: 2,
    },
    { handle: 'f1', name: 'Founder Uno', photo: null, groups: [], node: null },
  ],
}

const script: PresentationScript = {
  length: 20,
  featuredMoonAt: 0.5,
  founders: {
    handles: ['f1', 'f2'],
    challenges: ['First idea', 'Second idea'],
  },
  cues: [
    { kind: 'words', from: 2, to: 6, text: '{members} of us' },
    { kind: 'label', from: 8, to: 12, who: ['pioneer'] },
    { kind: 'show', from: 0, to: 1, part: 'cards', amount: [0, 1] },
  ],
}

function fakeTicker(): Ticker & { advance(ms: number): void } {
  let time = 0
  let queued: (() => void)[] = []
  return {
    now: () => time,
    next(step) {
      queued.push(step)
      return () => {
        queued = queued.filter((each) => each !== step)
      }
    },
    advance(ms) {
      time += ms
      const due = queued
      queued = []
      for (const step of due) step()
    },
  }
}

function setup(): {
  stage: ReturnType<typeof mount>
  ticker: ReturnType<typeof fakeTicker>
  rendered: StageState[]
  disposed: () => boolean
} {
  const ticker = fakeTicker()
  const rendered: StageState[] = []
  let disposed = false
  const stage = mount(PresentationStage, {
    props: {
      data,
      script,
      ticker,
      scene: () => ({
        render(state: StageState, named: readonly string[]) {
          rendered.push(state)
          return new Map(named.map((handle) => [handle, { x: 100, y: 50 }]))
        },
        dispose() {
          disposed = true
        },
      }),
    },
    attachTo: document.body,
  })
  return { stage, ticker, rendered, disposed: () => disposed }
}

const press = (key: string): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

function phone(coarse: boolean, wide: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches: coarse }))
  vi.stubGlobal('innerWidth', wide ? 900 : 400)
  vi.stubGlobal('innerHeight', wide ? 400 : 900)
}

beforeEach(() => phone(false, true))

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('PresentationStage (R-PRES-1..3)', () => {
  it('draws the first frame and waits with its controls showing', () => {
    const { rendered } = setup()

    expect(rendered[0]?.t).toBe(0)
    expect(document.querySelector('.controls')).not.toBeNull()
    expect(document.querySelector('.help')?.textContent).toContain(
      '0:00 / 0:20',
    )
  })

  it('plays on space, hiding the controls, and shows the words with their figures', async () => {
    const { stage, ticker } = setup()

    press(' ')
    ticker.advance(4000)
    await stage.vm.$nextTick()

    expect(document.querySelector('.controls')).toBeNull()
    expect(document.querySelector('.words')?.textContent).toBe('3 of us')
  })

  it('pauses on space and seeks with the arrows', async () => {
    const { stage, ticker, rendered } = setup()

    press(' ')
    ticker.advance(4000)
    press(' ')
    press('ArrowRight')
    await stage.vm.$nextTick()

    expect(rendered.at(-1)?.t).toBeCloseTo(9)
    press('ArrowLeft')
    press('ArrowLeft')
    expect(rendered.at(-1)?.t).toBeCloseTo(0)
  })

  it('labels a cast member where the scene places them, with their name', async () => {
    const { stage } = setup()

    press('ArrowRight')
    press('ArrowRight')
    await stage.vm.$nextTick()
    const label = document.querySelector('.tag')

    expect(label?.textContent).toContain('Pia Pioneer')
    expect((label as HTMLElement).style.left).toBe('100px')
  })

  it('shows the founders’ cards under their names from the cast', () => {
    setup()
    const kickers = [...document.querySelectorAll('.cards .kicker')].map(
      (each) => each.textContent,
    )

    expect(kickers).toEqual(['Founder Uno', 'A founder'])
  })

  it('plays and pauses on a tap of the stage (R-PRES-1)', async () => {
    const { stage, ticker } = setup()
    const tap = (): void => {
      ;(document.querySelector('.stage') as HTMLElement).click()
    }

    tap()
    ticker.advance(1000)
    await stage.vm.$nextTick()
    expect(document.querySelector('.controls')).toBeNull()

    tap()
    await stage.vm.$nextTick()
    expect(document.querySelector('.controls')).not.toBeNull()
  })

  it('plays from its button without the tap reaching the stage', async () => {
    const { stage, ticker } = setup()

    ;(document.querySelector('.buttons .btn-primary') as HTMLElement).click()
    ticker.advance(1000)
    await stage.vm.$nextTick()

    expect(document.querySelector('.controls')).toBeNull()
  })

  it('offers full screen only where the browser allows it', () => {
    setup()
    const label = [...document.querySelectorAll('.buttons button')].map(
      (each) => each.textContent?.trim(),
    )

    expect(label).toEqual(
      document.fullscreenEnabled === true ? ['Play', 'Full screen'] : ['Play'],
    )
  })

  it('asks a phone held upright to turn sideways, and says tap', () => {
    phone(true, false)
    setup()

    expect(document.querySelector('.turn')?.textContent).toContain('sideways')
    expect(document.querySelector('.help')?.textContent).toContain(
      'Tap to play',
    )
  })

  it('asks nothing of a phone held sideways, or of a laptop', () => {
    phone(true, true)
    setup()
    expect(document.querySelector('.turn')).toBeNull()
  })

  it('lets go of the scene when it leaves', () => {
    const { stage, disposed } = setup()

    stage.unmount()

    expect(disposed()).toBe(true)
  })
})
