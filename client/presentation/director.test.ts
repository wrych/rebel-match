import { describe, expect, it } from 'vitest'
import {
  lightKey,
  pacing,
  stageAt,
  type Aim,
  type DirectorWorld,
  type Script,
} from './director'

const world: DirectorWorld = {
  aim(aim: Aim) {
    if (aim.on === 'person')
      return { target: { x: 10, y: 0, z: 0 }, radii: 0.2 }
    if (aim.on === 'beyond')
      return { target: { x: 0, y: 0, z: 0 }, radii: 1000 }
    return { target: { x: 0, y: 0, z: 0 }, radii: 1 }
  },
  totals: { members: 312, challenges: 184, connections: 527 },
  groupOf: (group) => (group === 'developers' ? ['dev-one', 'dev-two'] : []),
}

const script = (cues: Script['cues'], length = 100): Script => ({
  length,
  featuredMoonAt: 0.5,
  cues,
})

describe('stageAt words (R-PRES-2)', () => {
  const words = script([
    { kind: 'words', from: 10, to: 20, text: 'Hello' },
    { kind: 'words', from: 30, to: 40, text: '{members} people joined' },
    {
      kind: 'words',
      from: 50,
      to: 60,
      text: 'Some of us face challenges.',
      swap: { word: 'Some', with: 'All', at: 54 },
    },
    {
      kind: 'words',
      from: 70,
      to: 79,
      text: 'to make work',
      cycle: ['better.', 'more humane.', 'fun.'],
    },
  ])

  it('shows words in their window, faded at both ends', () => {
    expect(stageAt(words, world, 9).words).toBeNull()
    expect(stageAt(words, world, 15).words).toEqual({
      spans: [{ text: 'Hello' }],
      opacity: 1,
    })
    expect(
      stageAt(words, world, 10 + pacing.fadeSeconds / 2).words?.opacity,
    ).toBeCloseTo(0.5)
  })

  it('fills in the figures since launch (R-PRES-7)', () => {
    expect(stageAt(words, world, 35).words?.spans[0]?.text).toBe(
      '312 people joined',
    )
  })

  it('strikes a word and puts another beside it, from its moment', () => {
    expect(stageAt(words, world, 52).words?.spans).toEqual([
      { text: 'Some of us face challenges.' },
    ])
    expect(stageAt(words, world, 56).words?.spans).toEqual([
      { text: 'Some', struck: true },
      { text: ' All', accent: true },
      { text: ' of us face challenges.' },
    ])
  })

  it('cycles the closing words through the window', () => {
    const word = (t: number): string | undefined =>
      stageAt(words, world, t).words?.spans[1]?.text
    expect([word(71), word(74), word(78)]).toEqual([
      ' better.',
      ' more humane.',
      ' fun.',
    ])
  })
})

describe('stageAt parts and growth', () => {
  const growing = script([
    { kind: 'show', from: 0, to: 2, part: 'founders', amount: [0, 1] },
    { kind: 'show', from: 50, to: 52, part: 'founders', amount: [1, 0] },
    { kind: 'grow', from: 10, to: 30, progress: [0, 0.5] },
    { kind: 'grow', from: 40, to: 60, progress: [0.5, 1] },
  ])

  it('fades a part in and holds it until the next cue for it', () => {
    expect(stageAt(growing, world, 1).parts.founders).toBeCloseTo(0.5)
    expect(stageAt(growing, world, 20).parts.founders).toBe(1)
    expect(stageAt(growing, world, 60).parts.founders).toBe(0)
    expect(stageAt(growing, world, 20).parts.network).toBe(0)
  })

  it('grows the real network only once it starts, and holds between', () => {
    expect(stageAt(growing, world, 5).progress).toBeNull()
    expect(stageAt(growing, world, 20).progress).toBeCloseTo(0.25)
    expect(stageAt(growing, world, 35).progress).toBe(0.5)
    expect(stageAt(growing, world, 80).progress).toBe(1)
  })
})

describe('stageAt camera', () => {
  const moving = script([
    { kind: 'camera', at: 10, aim: { on: 'person', who: 'pim' }, over: 4 },
    { kind: 'camera', at: 12, aim: { on: 'network' }, over: 4 },
    {
      kind: 'camera',
      at: 30,
      aim: { on: 'beyond' },
      over: 10,
      ease: 'accelerate',
    },
  ])

  it('starts on the whole network', () => {
    expect(stageAt(moving, world, 0).camera).toMatchObject({ radii: 1 })
  })

  it('glides on from where a cut-short move had got to', () => {
    const cut = stageAt(moving, world, 12).camera
    const after = stageAt(moving, world, 12.01).camera

    expect(cut.target.x).toBeGreaterThan(0)
    expect(cut.target.x).toBeLessThan(10)
    expect(Math.abs(after.target.x - cut.target.x)).toBeLessThan(0.1)
  })

  it('zooms out ever faster when accelerating', () => {
    const at = (t: number): number =>
      Math.log(stageAt(moving, world, t).camera.radii)
    expect(at(35) - at(32)).toBeGreaterThan(at(32) - at(30))
    expect(stageAt(moving, world, 40).camera.radii).toBeCloseTo(1000)
  })

  it('keeps turning', () => {
    expect(stageAt(moving, world, 20).camera.azimuth).toBeCloseTo(
      20 * pacing.turnPerSecond,
    )
  })
})

describe('stageAt lights, labels and flash', () => {
  const lit = script([
    { kind: 'light', from: 10, to: 20, what: { on: 'links' } },
    { kind: 'light', from: 10, to: 20, what: { on: 'person', who: 'pim' } },
    { kind: 'label', from: 10, to: 20, who: { group: 'developers' } },
    { kind: 'flash', at: 50, over: 1 },
  ])

  it('lights what a cue names, by key', () => {
    const lights = stageAt(lit, world, 15).lights

    expect(lights.get(lightKey({ on: 'links' }))).toBe(1)
    expect(lights.get('person:pim')).toBe(1)
    expect(stageAt(lit, world, 25).lights.size).toBe(0)
  })

  it('labels each member of a group', () => {
    expect(stageAt(lit, world, 15).labels).toEqual([
      { handle: 'dev-one', opacity: 1 },
      { handle: 'dev-two', opacity: 1 },
    ])
  })

  it('flashes up at once and fades', () => {
    expect(stageAt(lit, world, 49).flash).toBe(0)
    expect(stageAt(lit, world, 50).flash).toBe(1)
    expect(stageAt(lit, world, 50.5).flash).toBeCloseTo(0.5)
  })
})

describe('stageAt time (R-PRES-3)', () => {
  const film = script([{ kind: 'words', from: 40, to: 60, text: 'Middle' }])

  it('is the same picture for the same second', () => {
    expect(stageAt(film, world, 42.5)).toEqual(stageAt(film, world, 42.5))
  })

  it('stretches the script to the length shown', () => {
    expect(stageAt(film, world, 100, 200).words?.spans[0]?.text).toBe('Middle')
    expect(stageAt(film, world, 50, 200).words).toBeNull()
  })

  it('stays within the film', () => {
    expect(stageAt(film, world, -5).t).toBe(0)
    expect(stageAt(film, world, 500).t).toBe(100)
  })
})
