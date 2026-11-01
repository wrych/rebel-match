import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { fitOf, positionOf, steering } from '../network/camera'
import type { Point } from '../network/layout'
import { frameAt } from '../network/replay'
import { coordinates, Moons, paletteOf, type Palette } from '../network/scene'
import { lightKey, type StageState } from './director'
import type { World } from './world'

/** Where a named person is on the stage, in pixels, or null off it. */
export type Anchors = Map<string, { x: number; y: number } | null>

/** What draws the film: one state in, the named people's places out. */
export interface PresentationScene {
  render(state: StageState, named: readonly string[]): Anchors
  dispose(): void
}

const look = {
  fov: 50,
  nodeRadius: 2.2,
  founderRadius: 3.2,
  loneRadius: 3.6,
  haloRadius: 7,
  futureRadius: 1.6,
  litGrowth: 0.8,
  pulseSeconds: 1.2,
  moonEmphasis: 4,
  rebirthSpread: 1.3,
  futureBudget: 40_000,
  segments: { around: 12, up: 8 },
  linkOpacity: 0.5,
  maxPixelRatio: 2,
}

const pulse = (level: number, t: number): number =>
  level * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / look.pulseSeconds))

const sphere = (): SphereGeometry =>
  new SphereGeometry(1, look.segments.around, look.segments.up)

function dots(count: number, color: Color): InstancedMesh {
  const mesh = new InstancedMesh(
    sphere(),
    new MeshBasicMaterial({ color, transparent: true }),
    Math.max(count, 1),
  )
  mesh.count = 0
  mesh.frustumCulled = false
  return mesh
}

function segments(world: World, palette: Palette): LineSegments {
  const positions = world.timeline.links.flatMap(({ source, target }) => [
    ...coordinates(world.points[source]),
    ...coordinates(world.points[target]),
  ])
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setDrawRange(0, 0)
  return new LineSegments(
    geometry,
    new LineBasicMaterial({
      color: palette.link.clone(),
      transparent: true,
      opacity: look.linkOpacity,
    }),
  )
}

// The real network, as the replay grows it, and again, spread out, as the
// closing world forms around its lone dot (R-PRES-4).
class RealNetwork {
  readonly group = new Group()
  private readonly nodes: InstancedMesh
  private readonly links: LineSegments
  private readonly moons: Moons
  private readonly matrix = new Matrix4()
  private readonly lit: Set<number>[] = []

  constructor(
    private readonly world: World,
    private readonly palette: Palette,
  ) {
    this.nodes = dots(world.points.length, new Color(1, 1, 1))
    this.links = segments(world, palette)
    this.moons = new Moons(world.timeline, world.points, palette, false)
    this.group.add(this.links, this.nodes, this.moons.mesh)
  }

  render(state: StageState): void {
    const rebirth = state.parts.network === 0 && state.parts.rebirthNodes > 0
    const shown = this.shownCounts(state, rebirth)
    this.group.visible = shown.nodes > 0
    this.group.scale.setScalar(rebirth ? look.rebirthSpread : 1)
    this.placeNodes(state, shown.nodes)
    this.links.geometry.setDrawRange(0, shown.links * 2)
    this.tintLinks(state)
    this.moons.show(shown.moons, state.t * 1000)
    const featured = this.world.featuredMoon
    const moonLight = state.lights.get('moon') ?? 0
    this.moons.move(
      state.t * 1000,
      featured === null
        ? undefined
        : { index: featured, scale: 1 + look.moonEmphasis * moonLight },
    )
    this.tintMoons(state)
  }

  private shownCounts(
    state: StageState,
    rebirth: boolean,
  ): { nodes: number; links: number; moons: number } {
    const { nodes, links } = this.world.timeline
    if (rebirth)
      return {
        nodes: Math.round(state.parts.rebirthNodes * nodes.length),
        links: Math.round(state.parts.rebirthLinks * links.length),
        moons: 0,
      }
    if (state.progress === null || state.parts.network === 0)
      return { nodes: 0, links: 0, moons: 0 }
    return frameAt(this.world.timeline, state.progress)
  }

  private litNodes(state: StageState): Set<number> {
    const lit = new Set<number>()
    for (const [key, level] of state.lights) {
      if (level <= 0) continue
      const [kind, name = ''] = key.split(':')
      const handles =
        kind === 'person'
          ? [name]
          : kind === 'group'
            ? this.world.groupOf(name)
            : []
      for (const handle of handles) {
        const node = this.world.nodeOf(handle)
        if (node !== null) lit.add(node)
      }
    }
    return lit
  }

  // A person the film visits is drawn even before the replay reaches the
  // day they joined, so the camera never looks at an empty place.
  private placeNodes(state: StageState, count: number): void {
    const lit = this.litNodes(state)
    const drawn =
      count === 0 ? 0 : Math.max(count, ...[...lit].map((n) => n + 1))
    for (let index = 0; index < drawn; index++)
      this.placeNode(state, index, index < count || lit.has(index), lit)
    this.nodes.count = drawn
    this.markNodes(state)
  }

  private placeNode(
    state: StageState,
    index: number,
    shown: boolean,
    lit: ReadonlySet<number>,
  ): void {
    const own = lit.has(index) ? 1 : (state.lights.get('everyone') ?? 0)
    const all = pulse(state.lights.get('nodes') ?? 0, state.t)
    const grown = look.nodeRadius * (1 + look.litGrowth * Math.max(own, all))
    const scale = shown ? grown : 0
    this.matrix.makeScale(scale, scale, scale)
    this.matrix.setPosition(...coordinates(this.world.points[index]))
    this.nodes.setMatrixAt(index, this.matrix)
    this.nodes.setColorAt(
      index,
      own > 0 ? this.palette.self : this.palette.node,
    )
  }

  private markNodes(state: StageState): void {
    this.nodes.instanceMatrix.needsUpdate = true
    if (this.nodes.instanceColor !== null)
      this.nodes.instanceColor.needsUpdate = true
    ;(this.nodes.material as MeshBasicMaterial).opacity = Math.max(
      state.parts.network,
      state.parts.rebirthNodes > 0 ? 1 : 0,
    )
  }

  private tintLinks(state: StageState): void {
    const level = Math.max(
      pulse(state.lights.get(lightKey({ on: 'links' })) ?? 0, state.t),
      state.lights.get('everyone') ?? 0,
    )
    const material = this.links.material as LineBasicMaterial
    material.color.copy(this.palette.link).lerp(this.palette.self, level)
    material.opacity = look.linkOpacity + (1 - look.linkOpacity) * level
  }

  private tintMoons(state: StageState): void {
    const level = Math.max(
      pulse(state.lights.get('moons') ?? 0, state.t),
      state.lights.get('moon') ?? 0,
    )
    ;(this.moons.mesh.material as MeshBasicMaterial).color
      .setRGB(1, 1, 1)
      .lerp(this.palette.self, level * 0.6)
  }

  dispose(): void {
    for (const object of [this.nodes, this.links, this.moons.mesh]) {
      object.geometry.dispose()
      ;(object.material as MeshBasicMaterial).dispose()
    }
  }
}

// The invented beginning: two dots, a moon each, and the line between them.
class Founders {
  readonly group = new Group()
  private readonly dots: Mesh[]
  private readonly moons: Moons
  private readonly line: Line
  private readonly linePoints = new Float32BufferAttribute(
    new Float32Array(6),
    3,
  )

  constructor(
    private readonly world: World,
    private readonly palette: Palette,
  ) {
    this.dots = world.founders.map((at) => {
      const dot = new Mesh(
        sphere(),
        new MeshBasicMaterial({ color: palette.node }),
      )
      dot.position.set(at.x, at.y, at.z)
      return dot
    })
    this.moons = new Moons(
      {
        nodes: [0, 1].map((id) => ({ id, at: 0, day: '', self: false })),
        links: [],
        moons: [0, 1].map((node) => ({ node, at: 0, day: '' })),
        own: null,
      },
      world.founders,
      palette,
      false,
    )
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', this.linePoints)
    this.line = new Line(
      geometry,
      new LineBasicMaterial({ color: palette.link.clone() }),
    )
    this.group.add(this.line, this.moons.mesh, ...this.dots)
  }

  render(state: StageState): void {
    const shown = state.parts.founders
    this.group.visible = shown > 0
    for (const dot of this.dots) dot.scale.setScalar(look.founderRadius * shown)
    const moons = state.parts.founderMoons
    this.moons.show(moons <= 0 ? 0 : moons <= 0.5 ? 1 : 2, state.t * 1000)
    this.moons.move(state.t * 1000)
    this.drawLine(state)
  }

  private drawLine(state: StageState): void {
    const [from, to] = this.world.founders
    const reach = state.parts.founderLink
    this.linePoints.setXYZ(0, from.x, from.y, from.z)
    this.linePoints.setXYZ(
      1,
      from.x + (to.x - from.x) * reach,
      from.y + (to.y - from.y) * reach,
      from.z + (to.z - from.z) * reach,
    )
    this.linePoints.needsUpdate = true
    this.line.visible = reach > 0
    const level = state.lights.get('founderLink') ?? 0
    ;(this.line.material as LineBasicMaterial).color
      .copy(this.palette.link)
      .lerp(this.palette.self, level)
  }

  dispose(): void {
    for (const object of [this.line, this.moons.mesh, ...this.dots]) {
      object.geometry.dispose()
      ;(object.material as MeshBasicMaterial).dispose()
    }
  }
}

// The invented growth past today: copies of the network on wider shells,
// as many as a budget of dots allows (R-PRES-4).
function futureDots(world: World, palette: Palette): InstancedMesh {
  const perCopy = Math.max(world.points.length, 1)
  const copies = Math.min(
    world.futureOffsets.length,
    Math.floor(look.futureBudget / perCopy),
  )
  const mesh = dots(copies * perCopy, palette.moon)
  const matrix = new Matrix4()
  let index = 0
  for (const offset of world.futureOffsets.slice(0, copies))
    for (const point of world.points) {
      matrix.makeScale(look.futureRadius, look.futureRadius, look.futureRadius)
      matrix.setPosition(
        offset.x + point.x,
        offset.y + point.y,
        offset.z + point.z,
      )
      mesh.setMatrixAt(index++, matrix)
    }
  mesh.userData['total'] = index
  return mesh
}

// The closing world's lone dot: whoever is watching (R-PRES-4).
function loneDot(world: World, palette: Palette): Group {
  const group = new Group()
  const dot = new Mesh(sphere(), new MeshBasicMaterial({ color: palette.self }))
  dot.scale.setScalar(look.loneRadius)
  const halo = new Mesh(
    sphere(),
    new MeshBasicMaterial({
      color: palette.self,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    }),
  )
  halo.scale.setScalar(look.haloRadius)
  group.add(dot, halo)
  group.position.set(world.lone.x, world.lone.y, world.lone.z)
  return group
}

function stageCamera(
  camera: PerspectiveCamera,
  world: World,
  state: StageState,
): void {
  const fit = fitOf(camera.fov, camera.aspect)
  const distance = state.camera.radii * world.radius * fit
  const at = positionOf({
    target: state.camera.target,
    distance,
    azimuth: state.camera.azimuth,
    elevation: steering.elevation,
  })
  camera.position.set(at.x, at.y, at.z)
  camera.lookAt(...coordinates(state.camera.target))
  camera.near = Math.max(distance / 1000, 0.01)
  camera.far = distance + world.radius * look.rebirthSpread * 4 + distance * 4
  camera.updateProjectionMatrix()
}

function stageRenderer(host: HTMLElement): WebGLRenderer {
  const background = new Color(
    getComputedStyle(host).getPropertyValue('--paper').trim() || '#0b0d14',
  )
  const renderer = new WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(Math.min(devicePixelRatio, look.maxPixelRatio))
  renderer.setClearColor(background)
  host.appendChild(renderer.domElement)
  return renderer
}

// A named person in the network moves out with it in the closing world.
function placeOf(
  world: World,
  handle: string,
  state: StageState,
): Point | null {
  const at = world.pointOf(handle)
  if (at === null || world.nodeOf(handle) === null) return at
  const spread = state.parts.network === 0 ? look.rebirthSpread : 1
  return { x: at.x * spread, y: at.y * spread, z: at.z * spread }
}

function anchorsOf(
  places: readonly [string, Point | null][],
  camera: PerspectiveCamera,
  size: { width: number; height: number },
): Anchors {
  const spot = new Vector3()
  return new Map(
    places.map(([handle, at]) => {
      if (at === null) return [handle, null]
      spot.set(at.x, at.y, at.z).project(camera)
      return [
        handle,
        spot.z < 1
          ? {
              x: ((spot.x + 1) / 2) * size.width,
              y: ((1 - spot.y) / 2) * size.height,
            }
          : null,
      ]
    }),
  )
}

/** Draws the film in three.js on a dark stage (R-PRES-1). */
export function createPresentationScene(
  host: HTMLElement,
  world: World,
): PresentationScene {
  const palette = paletteOf(host)
  const renderer = stageRenderer(host)
  const camera = new PerspectiveCamera(look.fov, 1, 0.1, 1000)
  const network = new RealNetwork(world, palette)
  const founders = new Founders(world, palette)
  const future = futureDots(world, palette)
  const lone = loneDot(world, palette)
  const scene = new Scene()
  scene.add(network.group, founders.group, future, lone)

  return {
    render(state, named) {
      const size = {
        width: host.clientWidth || 1,
        height: host.clientHeight || 1,
      }
      renderer.setSize(size.width, size.height, false)
      camera.aspect = size.width / size.height
      stageCamera(camera, world, state)
      network.render(state)
      founders.render(state)
      future.count = Math.round(
        state.parts.future * Number(future.userData['total']),
      )
      lone.visible = state.parts.lone > 0
      lone.scale.setScalar(state.parts.lone)
      renderer.render(scene, camera)
      return anchorsOf(
        named.map((handle) => [handle, placeOf(world, handle, state)]),
        camera,
        size,
      )
    },
    dispose() {
      network.dispose()
      founders.dispose()
      future.geometry.dispose()
      ;(future.material as MeshBasicMaterial).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
