import type { Point } from '../network/layout'

/** Where the camera looks: the whole network, the founders, one cast member,
 * a group, the featured moon, past today's network, or the closing lone dot. */
export type Aim =
  | { on: 'network' }
  | { on: 'founders' }
  | { on: 'person'; who: string }
  | { on: 'group'; group: string }
  | { on: 'moon' }
  | { on: 'beyond' }
  | { on: 'lone' }

/** The parts of the picture a cue fades in or grows, each 0 to 1. */
export type Part =
  | 'founders'
  | 'founderMoons'
  | 'founderLink'
  | 'cards'
  | 'network'
  | 'future'
  | 'lone'
  | 'rebirthNodes'
  | 'rebirthLinks'

/** What a cue lights up. */
export type Light =
  | { on: 'nodes' | 'moons' | 'links' | 'founderLink' | 'moon' | 'everyone' }
  | { on: 'person'; who: string }
  | { on: 'group'; group: string }

/** One timed instruction of the script, in seconds of the script. */
export type Cue =
  | {
      kind: 'words'
      from: number
      to: number
      text: string
      swap?: { word: string; with: string; at: number }
      cycle?: string[]
    }
  | {
      kind: 'camera'
      at: number
      aim: Aim
      over: number
      ease?: 'smooth' | 'accelerate'
    }
  | { kind: 'grow'; from: number; to: number; progress: [number, number] }
  | {
      kind: 'show'
      from: number
      to: number
      part: Part
      amount: [number, number]
    }
  | { kind: 'light'; from: number; to: number; what: Light }
  | {
      kind: 'label'
      from: number
      to: number
      who: string[] | { group: string }
    }
  | { kind: 'flash'; at: number; over: number }

/** The whole film: its length as written, the cues, and where in the real
 * replay its featured moon pops in (R-PRES-2). */
export interface Script {
  length: number
  featuredMoonAt: number
  cues: Cue[]
}

/** What the director needs to know of the world: where an aim points and
 * how close to stand, the figures, and who is in a group. */
export interface DirectorWorld {
  aim(aim: Aim): { target: Point; radii: number }
  totals: { members: number; challenges: number; connections: number }
  groupOf(group: string): string[]
}

/** A stretch of the words on screen. */
export interface Span {
  text: string
  accent?: boolean
  struck?: boolean
}

/** Where the camera stands: what it looks at, how far in the world's radii,
 * and how it is turned. */
export interface CameraPose {
  target: Point
  radii: number
  azimuth: number
}

/** Everything on screen at one second (R-PRES-3). */
export interface StageState {
  t: number
  parts: Record<Part, number>
  progress: number | null
  lights: Map<string, number>
  camera: CameraPose
  words: { spans: Span[]; opacity: number } | null
  labels: { handle: string; opacity: number }[]
  flash: number
}

/** How the film breathes: fades, the camera's turn, the flash's rise. */
export const pacing = {
  fadeSeconds: 0.6,
  turnPerSecond: 0.035,
  flashRiseSeconds: 0.15,
}

const PARTS: readonly Part[] = [
  'founders',
  'founderMoons',
  'founderLink',
  'cards',
  'network',
  'future',
  'lone',
  'rebirthNodes',
  'rebirthLinks',
]

const unit = (x: number): number => Math.min(Math.max(x, 0), 1)
const smooth = (x: number): number => unit(x) * unit(x) * (3 - 2 * unit(x))
const lerp = (a: number, b: number, x: number): number => a + (b - a) * x

// Rises and falls over the fade at each end of a window.
function envelope(t: number, from: number, to: number): number {
  if (t < from || t > to) return 0
  const fade = Math.min(pacing.fadeSeconds, (to - from) / 2)
  return Math.min(unit((t - from) / fade), unit((to - t) / fade))
}

type Ramp = { from: number; to: number; values: [number, number] }

// A value held from the last ramp begun, eased across its window.
function heldAt(t: number, ramps: readonly Ramp[], before: number): number {
  let value = before
  for (const ramp of ramps) {
    if (t < ramp.from) break
    const span = ramp.to - ramp.from
    const x = span <= 0 ? 1 : smooth((t - ramp.from) / span)
    value = lerp(ramp.values[0], ramp.values[1], x)
  }
  return value
}

const byStart = <C extends { from: number }>(cues: C[]): C[] =>
  [...cues].sort((a, b) => a.from - b.from)

type Of<K extends Cue['kind']> = Extract<Cue, { kind: K }>

const cuesOf = <K extends Cue['kind']>(script: Script, kind: K): Of<K>[] =>
  script.cues.filter((cue): cue is Of<K> => cue.kind === kind)

function partsAt(script: Script, t: number): Record<Part, number> {
  const shows = byStart(cuesOf(script, 'show'))
  return Object.fromEntries(
    PARTS.map((part) => [
      part,
      heldAt(
        t,
        shows
          .filter((cue) => cue.part === part)
          .map((cue) => ({ from: cue.from, to: cue.to, values: cue.amount })),
        0,
      ),
    ]),
  ) as Record<Part, number>
}

function progressAt(script: Script, t: number): number | null {
  const grows = byStart(cuesOf(script, 'grow'))
  const first = grows[0]
  if (first === undefined || t < first.from) return null
  return heldAt(
    t,
    grows.map((cue) => ({ from: cue.from, to: cue.to, values: cue.progress })),
    first.progress[0],
  )
}

const lightKey = (light: Light): string =>
  light.on === 'person'
    ? `person:${light.who}`
    : light.on === 'group'
      ? `group:${light.group}`
      : light.on

function lightsAt(script: Script, t: number): Map<string, number> {
  const lights = new Map<string, number>()
  for (const cue of cuesOf(script, 'light')) {
    const level = envelope(t, cue.from, cue.to)
    const key = lightKey(cue.what)
    if (level > 0) lights.set(key, Math.max(lights.get(key) ?? 0, level))
  }
  return lights
}

function labelsAt(
  script: Script,
  world: DirectorWorld,
  t: number,
): StageState['labels'] {
  return cuesOf(script, 'label').flatMap((cue) => {
    const opacity = envelope(t, cue.from, cue.to)
    if (opacity === 0) return []
    const who = Array.isArray(cue.who) ? cue.who : world.groupOf(cue.who.group)
    return who.map((handle) => ({ handle, opacity }))
  })
}

function flashAt(script: Script, t: number): number {
  let flash = 0
  for (const cue of cuesOf(script, 'flash')) {
    if (t < cue.at - pacing.flashRiseSeconds || t > cue.at + cue.over) continue
    const level =
      t < cue.at
        ? 1 - (cue.at - t) / pacing.flashRiseSeconds
        : 1 - (t - cue.at) / cue.over
    flash = Math.max(flash, unit(level))
  }
  return flash
}

/** Each figure the script may quote, by its `{token}`. */
function filled(text: string, world: DirectorWorld): string {
  return text.replace(/\{(members|challenges|connections)\}/g, (_, key) =>
    String(world.totals[key as keyof DirectorWorld['totals']]),
  )
}

function spansOf(cue: Of<'words'>, world: DirectorWorld, t: number): Span[] {
  const text = filled(cue.text, world)
  if (cue.swap !== undefined && t >= cue.swap.at) {
    const [before, ...after] = text.split(cue.swap.word)
    return [
      { text: before ?? '' },
      { text: cue.swap.word, struck: true },
      { text: ` ${cue.swap.with}`, accent: true },
      { text: after.join(cue.swap.word) },
    ].filter((span) => span.text !== '')
  }
  if (cue.cycle !== undefined && cue.cycle.length > 0) {
    const share = (t - cue.from) / (cue.to - cue.from)
    const index = Math.min(
      Math.floor(share * cue.cycle.length),
      cue.cycle.length - 1,
    )
    return [{ text }, { text: ` ${cue.cycle[index] ?? ''}`, accent: true }]
  }
  return [{ text }]
}

function wordsAt(
  script: Script,
  world: DirectorWorld,
  t: number,
): StageState['words'] {
  const cue = cuesOf(script, 'words').find(
    (each) => t >= each.from && t <= each.to,
  )
  if (cue === undefined) return null
  return {
    spans: spansOf(cue, world, t),
    opacity: envelope(t, cue.from, cue.to),
  }
}

type Pose = { target: Point; radii: number }

function blend(from: Pose, to: Pose, x: number): Pose {
  return {
    target: {
      x: lerp(from.target.x, to.target.x, x),
      y: lerp(from.target.y, to.target.y, x),
      z: lerp(from.target.z, to.target.z, x),
    },
    radii: Math.exp(lerp(Math.log(from.radii), Math.log(to.radii), x)),
  }
}

const eased = (cue: Of<'camera'>, t: number): number => {
  const x = unit(cue.over <= 0 ? 1 : (t - cue.at) / cue.over)
  return cue.ease === 'accelerate' ? x * x * x : smooth(x)
}

// Each move starts from wherever the last one had got to, so a move cut
// short by the next glides on instead of jumping.
function cameraAt(script: Script, world: DirectorWorld, t: number): CameraPose {
  const moves = [...cuesOf(script, 'camera')].sort((a, b) => a.at - b.at)
  let pose: Pose = world.aim({ on: 'network' })
  let start = pose
  let current: Of<'camera'> | null = null
  for (const move of moves) {
    if (move.at > t) break
    if (current !== null)
      start = blend(start, world.aim(current.aim), eased(current, move.at))
    current = move
  }
  if (current !== null)
    pose = blend(start, world.aim(current.aim), eased(current, t))
  return { ...pose, azimuth: t * pacing.turnPerSecond }
}

/** The film at `seconds` into a showing of `length` seconds: the script's
 * times stretch to fit (R-PRES-2, R-PRES-3). */
export function stageAt(
  script: Script,
  world: DirectorWorld,
  seconds: number,
  length = script.length,
): StageState {
  const t = Math.min(Math.max(seconds, 0), length) * (script.length / length)
  return {
    t,
    parts: partsAt(script, t),
    progress: progressAt(script, t),
    lights: lightsAt(script, t),
    camera: cameraAt(script, world, t),
    words: wordsAt(script, world, t),
    labels: labelsAt(script, world, t),
    flash: flashAt(script, t),
  }
}

/** The key a light is held under, for the scene to look up. */
export { lightKey }
