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
import type { Point } from './layout'
import type { Frame } from './replay'

/** What draws the replay. The graph component drives it and never touches
 * the 3D library, so a presentation can drive the same scene. */
export interface NetworkScene {
  show(frame: Frame): void
  /** Marks the viewer's own point and turns the camera to it (R-NET-2). */
  highlight(on: boolean): void
  dispose(): void
}

/** Builds a scene in `host` for a timeline laid out at `points`. */
export type SceneFactory = (
  host: HTMLElement,
  timeline: NetworkTimeline,
  points: readonly Point[],
  options: { still: boolean },
) => NetworkScene

const tuning = {
  nodeRadius: 2,
  selfRadius: 3.4,
  haloRadius: 5,
  popMs: 600,
  rotateSpeed: 0.6,
  linkOpacity: 0.45,
  cameraFov: 50,
  cameraNear: 0.1,
  cameraMargin: 2.4,
  farPlaneRadii: 20,
  smallestRadius: 10,
  focusRadii: 1.8,
  focusEase: 0.04,
  haloPulseMs: 900,
  haloOpacity: { least: 0.15, swing: 0.45 },
  sphereSegments: { around: 16, up: 12 },
  haloSegments: { around: 14, up: 10 },
  maxPixelRatio: 2,
}

type Palette = Record<'node' | 'self' | 'link', Color>

function paletteOf(host: HTMLElement): Palette {
  const style = getComputedStyle(host)
  const read = (name: string, fallback: string): Color =>
    new Color(style.getPropertyValue(name).trim() || fallback)
  return {
    node: read('--ink', '#111010'),
    self: read('--accent', '#d4471f'),
    link: read('--muted', '#6b6659'),
  }
}

const coordinates = (point: Point | undefined): [number, number, number] => [
  point?.x ?? 0,
  point?.y ?? 0,
  point?.z ?? 0,
]

function radiusOf(points: readonly Point[]): number {
  return Math.max(
    tuning.smallestRadius,
    ...points.map((p) => Math.hypot(p.x, p.y, p.z)),
  )
}

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
  camera.position.set(0, 0, radius * tuning.cameraMargin)
  return camera
}

function viewIn(host: HTMLElement, radius: number, still: boolean): View {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, tuning.maxPixelRatio))
  host.appendChild(renderer.domElement)
  const camera = cameraFor(radius)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.autoRotate = !still
  controls.autoRotateSpeed = tuning.rotateSpeed
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

// The camera eases towards the viewer's point while their halo pulses.
class Focus {
  on = false
  private readonly target = new Vector3()

  constructor(
    private readonly view: View,
    private readonly self: Point | undefined,
    private readonly halo: Mesh,
    private readonly distance: number,
    private readonly still: boolean,
  ) {}

  set(on: boolean): void {
    this.on = on && this.self !== undefined
    this.halo.visible = this.on
    this.view.controls.autoRotate = !this.still && !this.on
  }

  turn(now: number): void {
    if (!this.on) return
    const { camera, controls } = this.view
    const ease = this.still ? 1 : tuning.focusEase
    controls.target.lerp(this.target.set(...coordinates(this.self)), ease)
    const away = camera.position.clone().sub(controls.target)
    away.setLength(away.length() + (this.distance - away.length()) * ease)
    camera.position.copy(controls.target).add(away)
    const pulse = this.still ? 1 : (Math.sin(now / tuning.haloPulseMs) + 1) / 2
    ;(this.halo.material as MeshBasicMaterial).opacity =
      tuning.haloOpacity.least + pulse * tuning.haloOpacity.swing
  }
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

/** The replay in three.js: points that pop in where the settled network puts
 * them and lines between them, turning at the end to the viewer's point. */
export const createThreeScene: SceneFactory = (
  host,
  timeline,
  points,
  { still },
) => {
  const palette = paletteOf(host)
  const radius = radiusOf(points)
  const view = viewIn(host, radius, still)
  const selfIndex = timeline.nodes.findIndex((node) => node.self)
  const nodes = nodeMesh(timeline, palette)
  const links = linkLines(timeline, points, palette)
  const halo = haloMesh(points[selfIndex], palette)
  const objects = [links, nodes, halo]
  const scene = sceneOf(objects)
  const growth = new Growth(nodes, points, selfIndex, still)
  const focus = new Focus(
    view,
    points[selfIndex],
    halo,
    radius * tuning.focusRadii,
    still,
  )

  let frame = 0
  const render = (now: number): void => {
    growth.grow(now)
    focus.turn(now)
    view.controls.update()
    view.renderer.render(scene, view.camera)
    frame = requestAnimationFrame(render)
  }
  frame = requestAnimationFrame(render)

  return {
    show({ nodes: count, links: linkCount }) {
      growth.show(count, performance.now())
      links.geometry.setDrawRange(0, linkCount * 2)
    },
    highlight: (on) => focus.set(on),
    dispose() {
      cancelAnimationFrame(frame)
      disposeAll(objects)
      view.dispose()
    },
  }
}
