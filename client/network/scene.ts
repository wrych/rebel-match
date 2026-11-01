import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
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
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { NetworkTimeline } from '../../src/network/timeline'
import {
  fitOf,
  goalOf,
  poseOf,
  reach,
  positionOf,
  stepTo,
  steering,
  type Pose,
} from './camera'
import type { Point } from './layout'
import { moonAt, orbitsOf, type Orbit } from './orbits'
import type { Frame } from './replay'

/** What draws the replay. The graph component drives it and never touches
 * the 3D library, so a presentation can drive the same scene. */
export interface NetworkScene {
  show(frame: Frame): void
  /** Marks the viewer's own point and turns the camera to it (R-NET-2). */
  highlight(on: boolean): void
  /** Hands the view back to the replay after the member took it. */
  recentre(): void
  dispose(): void
}

/** Builds a scene in `host` for a timeline laid out at `points`. */
export type SceneFactory = (
  host: HTMLElement,
  timeline: NetworkTimeline,
  points: readonly Point[],
  options: {
    still: boolean
    /** Told when the member drags, pinches or scrolls the view: from then
     * on it is theirs until `recentre`. */
    onTakeOver: () => void
    /** Where the viewer's lit point is on the stage, in pixels from its top
     * left, while the replay steers the view; null otherwise (R-NET-14). */
    onAnchor?: (at: { x: number; y: number } | null) => void
  },
) => NetworkScene

const tuning = {
  nodeRadius: 2,
  moonRadius: 1.1,
  selfRadius: 3.4,
  haloRadius: 5,
  popMs: 600,
  linkOpacity: 0.45,
  cameraFov: 50,
  cameraNear: 0.1,
  farPlaneRadii: 20,
  smallestRadius: 10,
  haloPulseMs: 900,
  haloOpacity: { least: 0.15, swing: 0.45 },
  sphereSegments: { around: 12, up: 8 },
  moonSegments: { around: 8, up: 6 },
  haloSegments: { around: 14, up: 10 },
  maxPixelRatio: 2,
}

/** The scene's colours, read from the theme's tokens on the host. */
export type Palette = Record<'node' | 'self' | 'link' | 'moon', Color>

/** The colours of the theme the host sits in. */
export function paletteOf(host: HTMLElement): Palette {
  const style = getComputedStyle(host)
  const read = (name: string, fallback: string): Color =>
    new Color(style.getPropertyValue(name).trim() || fallback)
  return {
    node: read('--ink', '#111010'),
    self: read('--accent', '#d4471f'),
    link: read('--muted', '#6b6659'),
    moon: read('--faint', '#8a8579'),
  }
}

/** A point as three numbers, the origin for none. */
export const coordinates = (
  point: Point | undefined,
): [number, number, number] => [point?.x ?? 0, point?.y ?? 0, point?.z ?? 0]

// The viewer's own lines take the accent colour, everyone else's are muted.
function linkLines(
  timeline: NetworkTimeline,
  points: readonly Point[],
  palette: Palette,
): LineSegments {
  const self = timeline.nodes.findIndex((node) => node.self)
  const positions: number[] = []
  const tints: number[] = []
  for (const { source, target } of timeline.links) {
    const own = source === self || target === self
    const tint = own ? palette.self : palette.link
    positions.push(
      ...coordinates(points[source]),
      ...coordinates(points[target]),
    )
    tints.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(tints, 3))
  geometry.setDrawRange(0, 0)
  const material = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: tuning.linkOpacity,
  })
  return new LineSegments(geometry, material)
}

function nodeMesh(timeline: NetworkTimeline, palette: Palette): InstancedMesh {
  const { around, up } = tuning.sphereSegments
  const mesh = new InstancedMesh(
    new SphereGeometry(1, around, up),
    new MeshBasicMaterial(),
    Math.max(timeline.nodes.length, 1),
  )
  timeline.nodes.forEach((node, index) =>
    mesh.setColorAt(index, node.self ? palette.self : palette.node),
  )
  mesh.count = 0
  // Its bounds are reckoned before any point is placed, so culling by them
  // would hide every point once the camera turns away from the centre.
  mesh.frustumCulled = false
  return mesh
}

function haloMesh(at: Point | undefined, palette: Palette): Mesh {
  const { around, up } = tuning.haloSegments
  const halo = new Mesh(
    new SphereGeometry(tuning.haloRadius, around, up),
    new MeshBasicMaterial({
      color: palette.self,
      wireframe: true,
      transparent: true,
      opacity: 0,
    }),
  )
  halo.position.set(...coordinates(at))
  halo.visible = false
  return halo
}

interface View {
  renderer: WebGLRenderer
  camera: PerspectiveCamera
  controls: OrbitControls
  dispose(): void
}

function cameraFor(radius: number): PerspectiveCamera {
  const far = radius * tuning.farPlaneRadii
  const camera = new PerspectiveCamera(
    tuning.cameraFov,
    1,
    tuning.cameraNear,
    far,
  )
  camera.position.set(0, 0, radius * fitOf(tuning.cameraFov, 1))
  return camera
}

function viewIn(host: HTMLElement, radius: number): View {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, tuning.maxPixelRatio))
  host.appendChild(renderer.domElement)
  const camera = cameraFor(radius)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.screenSpacePanning = true
  const resize = (): void => {
    const width = host.clientWidth || 1
    const height = host.clientHeight || 1
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  return {
    renderer,
    camera,
    controls,
    dispose() {
      observer.disconnect()
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

/** Each challenge circling its member, popping in as it is posted; the
 * viewer's own moons take the accent colour (R-NET-11). */
export class Moons {
  readonly mesh: InstancedMesh
  private readonly orbits: Orbit[]
  private readonly bornAt: number[] = []
  private readonly matrix = new Matrix4()
  private shown = 0

  constructor(
    timeline: NetworkTimeline,
    private readonly points: readonly Point[],
    palette: Palette,
    private readonly still: boolean,
  ) {
    const { around, up } = tuning.moonSegments
    this.orbits = orbitsOf(timeline)
    this.mesh = new InstancedMesh(
      new SphereGeometry(1, around, up),
      new MeshBasicMaterial(),
      Math.max(this.orbits.length, 1),
    )
    this.orbits.forEach((orbit, index) => {
      const own = timeline.nodes[orbit.node]?.self === true
      this.mesh.setColorAt(index, own ? palette.self : palette.moon)
    })
    this.mesh.count = 0
    this.mesh.frustumCulled = false
  }

  show(count: number, now: number): void {
    for (let index = this.shown; index < count; index++)
      this.bornAt[index] = now
    this.shown = count
    this.mesh.count = count
  }

  /** Places each moon at `now`; `emphasis` grows one of them. */
  move(now: number, emphasis?: { index: number; scale: number }): void {
    for (let index = 0; index < this.shown; index++) {
      const orbit = this.orbits[index] as Orbit
      const at = moonAt(
        orbit,
        this.points[orbit.node] ?? ORIGIN,
        now,
        this.still,
      )
      const age = (now - (this.bornAt[index] ?? now)) / tuning.popMs
      const grown = this.still ? 1 : Math.min(Math.max(age, 0), 1)
      const grownScale = tuning.moonRadius * (1 - (1 - grown) ** 3)
      const scale =
        emphasis?.index === index ? grownScale * emphasis.scale : grownScale
      this.matrix.makeScale(scale, scale, scale)
      this.matrix.setPosition(at.x, at.y, at.z)
      this.mesh.setMatrixAt(index, this.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

const ORIGIN: Point = { x: 0, y: 0, z: 0 }

// Points pop in over a moment as they join, unless motion is reduced.
class Growth {
  private readonly bornAt: number[] = []
  private readonly growing = new Set<number>()
  private readonly matrix = new Matrix4()
  private shown = 0

  constructor(
    private readonly mesh: InstancedMesh,
    private readonly points: readonly Point[],
    private readonly selfIndex: number,
    private readonly still: boolean,
  ) {}

  show(count: number, now: number): void {
    for (let index = this.shown; index < count; index++) {
      this.bornAt[index] = now
      this.growing.add(index)
      this.place(index, now)
    }
    for (let index = count; index < this.shown; index++)
      this.growing.delete(index)
    this.shown = count
    this.mesh.count = count
    this.mesh.instanceMatrix.needsUpdate = true
  }

  grow(now: number): void {
    for (const index of this.growing)
      if (!this.place(index, now)) this.growing.delete(index)
    this.mesh.instanceMatrix.needsUpdate = true
  }

  private place(index: number, now: number): boolean {
    const age = (now - (this.bornAt[index] ?? now)) / tuning.popMs
    const grown = this.still ? 1 : Math.min(Math.max(age, 0), 1)
    const base =
      index === this.selfIndex ? tuning.selfRadius : tuning.nodeRadius
    const scale = base * (1 - (1 - grown) ** 3)
    this.matrix.makeScale(scale, scale, scale)
    this.matrix.setPosition(...coordinates(this.points[index]))
    this.mesh.setMatrixAt(index, this.matrix)
    return grown < 1
  }
}

const pointOf = (v: Vector3): Point => ({ x: v.x, y: v.y, z: v.z })

// The replay steers the camera until the member takes it, as a map does: one
// drag, pinch or scroll and it is theirs, until they recentre.
class Director {
  private pose: Pose
  private steering = true
  private focus: Point | null = null
  private shown = 0
  private last: number | null = null

  constructor(
    private readonly view: View,
    private readonly points: readonly Point[],
    private readonly floor: number,
    private readonly still: boolean,
  ) {
    this.pose = this.goalPose()
  }

  show(count: number): void {
    this.shown = count
  }

  aim(focus: Point | null): void {
    this.focus = focus
  }

  takeOver(): void {
    this.steering = false
  }

  get isSteering(): boolean {
    return this.steering
  }

  recentre(): void {
    const { camera, controls } = this.view
    this.pose = poseOf(pointOf(camera.position), pointOf(controls.target))
    this.steering = true
  }

  step(now: number): void {
    const elapsed = this.last === null ? 0 : now - this.last
    this.last = now
    const { camera, controls } = this.view
    if (!this.steering) {
      controls.update()
      return
    }
    const goal = goalOf(
      this.points,
      this.shown,
      this.focus,
      this.floor,
      this.fit(),
    )
    this.pose = stepTo(this.pose, goal, elapsed, this.still)
    const at = positionOf(this.pose)
    camera.position.set(at.x, at.y, at.z)
    controls.target.set(...coordinates(this.pose.target))
    camera.lookAt(controls.target)
  }

  private fit(): number {
    return fitOf(this.view.camera.fov, this.view.camera.aspect)
  }

  private goalPose(): Pose {
    const goal = goalOf(this.points, this.shown, null, this.floor, this.fit())
    return {
      ...goal,
      azimuth: 0,
      elevation: steering.elevation,
    }
  }
}

// The controls start on the member's first drag, pinch or scroll.
function handOver(
  view: View,
  director: Director,
  onTakeOver: () => void,
): () => void {
  const takeOver = (): void => {
    director.takeOver()
    onTakeOver()
  }
  view.controls.addEventListener('start', takeOver)
  return () => view.controls.removeEventListener('start', takeOver)
}

// Reports the lit point's place on the stage when it moves by a pixel or
// more, so a label can follow it without a re-render every frame.
function anchorer(
  view: View,
  at: Point | null,
  report: ((place: { x: number; y: number } | null) => void) | undefined,
): (shown: boolean) => void {
  const spot = new Vector3()
  let last: { x: number; y: number } | null = null
  return (shown) => {
    if (report === undefined) return
    let place: { x: number; y: number } | null = null
    if (shown && at !== null) {
      spot.set(at.x, at.y, at.z).project(view.camera)
      const canvas = view.renderer.domElement
      if (spot.z < 1)
        place = {
          x: ((spot.x + 1) / 2) * canvas.clientWidth,
          y: ((1 - spot.y) / 2) * canvas.clientHeight,
        }
    }
    const moved =
      place === null || last === null
        ? place !== last
        : Math.abs(place.x - last.x) >= 1 || Math.abs(place.y - last.y) >= 1
    if (!moved) return
    last = place
    report(place)
  }
}

function pulse(halo: Mesh, now: number, still: boolean): void {
  if (!halo.visible) return
  const swing = still ? 1 : (Math.sin(now / tuning.haloPulseMs) + 1) / 2
  ;(halo.material as MeshBasicMaterial).opacity =
    tuning.haloOpacity.least + swing * tuning.haloOpacity.swing
}

function sceneOf(objects: (Mesh | LineSegments)[]): Scene {
  const scene = new Scene()
  scene.add(...objects)
  return scene
}

function disposeAll(objects: (Mesh | LineSegments)[]): void {
  for (const object of objects) {
    object.geometry.dispose()
    ;(object.material as MeshBasicMaterial).dispose()
  }
}

function everyFrame(draw: (now: number) => void): () => void {
  let frame = 0
  const step = (now: number): void => {
    draw(now)
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
  return () => cancelAnimationFrame(frame)
}

/** The replay in three.js: points that pop in where the settled network puts
 * them, lines between them and challenges circling them as moons, turning
 * at the end towards the viewer's point. */
export const createThreeScene: SceneFactory = (
  host,
  timeline,
  points,
  { still, onTakeOver, onAnchor },
) => {
  const palette = paletteOf(host)
  const view = viewIn(host, Math.max(reach(points), tuning.smallestRadius))
  const selfIndex = timeline.nodes.findIndex((node) => node.self)
  const self = points[selfIndex] ?? null
  const nodes = nodeMesh(timeline, palette)
  const links = linkLines(timeline, points, palette)
  const halo = haloMesh(points[selfIndex], palette)
  const moons = new Moons(timeline, points, palette, still)
  const objects = [links, nodes, moons.mesh, halo]
  const scene = sceneOf(objects)
  const growth = new Growth(nodes, points, selfIndex, still)
  const director = new Director(view, points, tuning.smallestRadius, still)
  const release = handOver(view, director, onTakeOver)
  const anchor = anchorer(view, self, onAnchor)

  const stop = everyFrame((now) => {
    growth.grow(now)
    moons.move(now)
    director.step(now)
    pulse(halo, now, still)
    view.renderer.render(scene, view.camera)
    anchor(halo.visible && director.isSteering)
  })

  return {
    show(shown) {
      const now = performance.now()
      growth.show(shown.nodes, now)
      moons.show(shown.moons, now)
      director.show(shown.nodes)
      links.geometry.setDrawRange(0, shown.links * 2)
    },
    highlight(on) {
      const lit = on && self !== null
      halo.visible = lit
      director.aim(lit ? self : null)
    },
    recentre: () => director.recentre(),
    dispose() {
      stop()
      release()
      disposeAll(objects)
      view.dispose()
    },
  }
}
