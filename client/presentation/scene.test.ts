// @vitest-environment jsdom
import {
  Line,
  type Material,
  Mesh,
  type Object3D,
  Scene,
  type BufferGeometry,
} from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NetworkTimeline } from '../../src/network/timeline'
import { createPresentationScene } from './scene'
import { buildWorld } from './world'

// jsdom has no WebGL, so the renderer is the one stand-in; everything the
// film draws is real three.js.
vi.mock('../network/three-kit', async (actual) => ({
  ...(await actual<typeof import('../network/three-kit')>()),
  rendererIn: (host: HTMLElement) => {
    const canvas = document.createElement('canvas')
    host.append(canvas)
    return {
      domElement: canvas,
      setClearColor: () => undefined,
      setSize: () => undefined,
      render: () => undefined,
      dispose: () => undefined,
    }
  },
}))

const timeline: NetworkTimeline = {
  nodes: [0, 1, 2].map((id) => ({
    id,
    at: id / 3,
    day: '2026-10-01',
    self: false,
  })),
  links: [{ source: 0, target: 1, at: 0.5, day: '2026-10-02' }],
  moons: [{ node: 1, at: 0.6, day: '2026-10-02' }],
  own: null,
}

const world = buildWorld(
  { timeline, cast: [] },
  { featuredMoonAt: 0.6, founders: { handles: ['f1', 'f2'] } },
)

function drawnBy(roots: readonly Object3D[]): (BufferGeometry | Material)[] {
  const held = new Set<BufferGeometry | Material>()
  for (const root of roots)
    root.traverse((object) => {
      if (!(object instanceof Mesh || object instanceof Line)) return
      held.add(object.geometry as BufferGeometry)
      const materials = [object.material as Material | Material[]].flat()
      for (const material of materials) held.add(material)
    })
  return [...held]
}

// jsdom has no ResizeObserver either; the stage only needs one to exist.
class NoResize {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoResize)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the presentation scene (R-PRES-1)', () => {
  it('frees every geometry and material it drew when it is let go', () => {
    const added: Object3D[] = []
    const add = Scene.prototype.add
    vi.spyOn(Scene.prototype, 'add').mockImplementation(function (
      this: Scene,
      ...objects: Object3D[]
    ) {
      added.push(...objects)
      return add.apply(this, objects)
    })
    const stage = createPresentationScene(document.createElement('div'), world)
    const kept = new Set(drawnBy(added))
    for (const thing of kept)
      thing.addEventListener('dispose', () => kept.delete(thing))

    stage.dispose()

    expect(kept.size).toBe(0)
  })
})
