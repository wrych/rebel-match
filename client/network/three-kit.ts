import {
  InstancedMesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type Camera,
  type Line,
  type Material,
  type Mesh,
  type WebGLRendererParameters,
} from 'three'
import type { Point } from './layout'

/** The sharpest the scenes draw, however dense the screen. */
export const maxPixelRatio = 2

/** A place on the stage, in pixels from its top left. */
export interface StagePlace {
  x: number
  y: number
}

/** Where a point in normalized device coordinates falls on a stage of `size`,
 * or null when it is behind the camera or past its far plane. */
export function stagePlaceOf(
  device: { x: number; y: number; z: number },
  size: { width: number; height: number },
): StagePlace | null {
  if (device.z >= 1) return null
  return {
    x: ((device.x + 1) / 2) * size.width,
    y: ((1 - device.y) / 2) * size.height,
  }
}

/** Projects each point through `camera` onto a stage of `size`. */
export function projector(
  camera: Camera,
): (at: Point, size: { width: number; height: number }) => StagePlace | null {
  const spot = new Vector3()
  return (at, size) =>
    stagePlaceOf(spot.set(at.x, at.y, at.z).project(camera), size)
}

/** Frees the geometry and material of each object. */
export function disposeAll(objects: readonly (Mesh | Line)[]): void {
  for (const object of objects) {
    object.geometry.dispose()
    ;(object.material as Material).dispose()
  }
}

/** A renderer on a canvas appended to `host`, its pixel ratio capped. */
export function rendererIn(
  host: HTMLElement,
  parameters: WebGLRendererParameters,
): WebGLRenderer {
  const renderer = new WebGLRenderer(parameters)
  renderer.setPixelRatio(Math.min(devicePixelRatio, maxPixelRatio))
  host.appendChild(renderer.domElement)
  return renderer
}

/** Room for `capacity` unit spheres, none of them drawn yet. */
export function instancedSpheres(
  capacity: number,
  segments: { around: number; up: number },
  material: MeshBasicMaterial = new MeshBasicMaterial(),
): InstancedMesh {
  const mesh = new InstancedMesh(
    new SphereGeometry(1, segments.around, segments.up),
    material,
    Math.max(capacity, 1),
  )
  mesh.count = 0
  // Its bounds are reckoned before any point is placed, so culling by them
  // would hide every point once the camera turns away from the centre.
  mesh.frustumCulled = false
  return mesh
}
