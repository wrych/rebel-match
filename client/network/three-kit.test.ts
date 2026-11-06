import { PerspectiveCamera } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  followSize,
  instancedSpheres,
  projector,
  stagePlaceOf,
  type StageSize,
} from './three-kit'

const STAGE = { width: 800, height: 600 }

describe('stagePlaceOf', () => {
  it('puts the centre of the view at the centre of the stage', () => {
    expect(stagePlaceOf({ x: 0, y: 0, z: 0.5 }, STAGE)).toEqual({
      x: 400,
      y: 300,
    })
  })

  it('measures from the top left, with up on screen as up in the view', () => {
    expect(stagePlaceOf({ x: -1, y: 1, z: 0 }, STAGE)).toEqual({ x: 0, y: 0 })
    expect(stagePlaceOf({ x: 1, y: -1, z: 0 }, STAGE)).toEqual({
      x: 800,
      y: 600,
    })
  })

  it('places nothing at or past the far side of the view', () => {
    expect(stagePlaceOf({ x: 0, y: 0, z: 1 }, STAGE)).toBeNull()
    expect(stagePlaceOf({ x: 0, y: 0, z: 1.5 }, STAGE)).toBeNull()
  })
})

describe('projector', () => {
  const camera = new PerspectiveCamera(50, STAGE.width / STAGE.height, 0.1, 100)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const project = projector(camera)

  it('places the point the camera looks at in the middle of the stage', () => {
    const place = project({ x: 0, y: 0, z: 0 }, STAGE)
    expect(place?.x).toBeCloseTo(400)
    expect(place?.y).toBeCloseTo(300)
  })

  it('places a point above and to the right up and to the right', () => {
    const place = project({ x: 1, y: 1, z: 0 }, STAGE)
    expect(place?.x).toBeGreaterThan(400)
    expect(place?.y).toBeLessThan(300)
  })

  it('places nothing behind the camera', () => {
    expect(project({ x: 0, y: 0, z: 20 }, STAGE)).toBeNull()
  })
})

describe('instancedSpheres', () => {
  it('holds room for at least one sphere and draws none until told', () => {
    const empty = instancedSpheres(0, { around: 8, up: 6 })
    expect(empty.instanceMatrix.count).toBe(1)
    expect(empty.count).toBe(0)
    const many = instancedSpheres(5, { around: 8, up: 6 })
    expect(many.instanceMatrix.count).toBe(5)
    expect(many.count).toBe(0)
  })

  it('is never culled by bounds reckoned before its points are placed', () => {
    expect(instancedSpheres(3, { around: 8, up: 6 }).frustumCulled).toBe(false)
  })
})

describe('followSize', () => {
  // The browser's observer, reduced to what a test can drive by hand.
  class Watcher {
    static last: Watcher | null = null
    watching = false
    constructor(readonly changed: () => void) {
      Watcher.last = this
    }
    observe(): void {
      this.watching = true
    }
    disconnect(): void {
      this.watching = false
    }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function follow(host: { clientWidth: number; clientHeight: number }): {
    sizes: StageSize[]
    stop: () => void
  } {
    vi.stubGlobal('ResizeObserver', Watcher)
    const sizes: StageSize[] = []
    const stop = followSize(host as HTMLElement, (size) => sizes.push(size))
    return { sizes, stop }
  }

  it('reads the size at once, then only when the host changes', () => {
    const host = { clientWidth: 800, clientHeight: 600 }
    const { sizes } = follow(host)
    host.clientWidth = 1024
    Watcher.last?.changed()

    expect(sizes).toEqual([
      { width: 800, height: 600 },
      { width: 1024, height: 600 },
    ])
  })

  it('never reads a size of zero from a host not laid out yet', () => {
    expect(follow({ clientWidth: 0, clientHeight: 0 }).sizes).toEqual([
      { width: 1, height: 1 },
    ])
  })

  it('stops watching once told to', () => {
    follow({ clientWidth: 800, clientHeight: 600 }).stop()

    expect(Watcher.last?.watching).toBe(false)
  })
})
