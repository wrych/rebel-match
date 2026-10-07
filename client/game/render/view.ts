import type { Spot } from '../core/floors'
import type { DayState, Employee } from '../core/state'

/** What the screen shows of the floor: its top-left corner and size, in
 * tiles. */
export interface View {
  x: number
  y: number
  width: number
  height: number
}

/** How many tiles tall the screen shows, whatever its size. */
export const TILES_TALL = 9

const clamp = (value: number, low: number, high: number): number =>
  high < low ? (low + high) / 2 : Math.min(high, Math.max(low, value))

/** The camera on the player, kept inside the floor (R-GAME-12). */
export function follow(
  player: Spot,
  floor: { width: number; height: number },
  aspect: number,
): View {
  const height = TILES_TALL
  const width = height * aspect
  return {
    x: clamp(player.x - width / 2, 0, floor.width - width),
    y: clamp(player.y - height / 2, 0, floor.height - height),
    width,
    height,
  }
}

const inView = (view: View, at: Spot): boolean =>
  at.x >= view.x &&
  at.y >= view.y &&
  at.x <= view.x + view.width &&
  at.y <= view.y + view.height

/** Whether an employee is trouble the player should know of: tempted or a
 * rebel in boss mode; grey, or heating up, in rebel mode (R-GAME-12). */
export function trouble(state: DayState, employee: Employee): boolean {
  if (state.mode === 'boss') return employee.spirit !== 'grey'
  return employee.spirit === 'grey' || employee.heat > 0
}

/** An arrow at the screen's edge pointing at trouble out of view. */
export interface Marker {
  /** Where on the edge, in tiles. */
  at: Spot
  /** The direction to the trouble, in radians. */
  angle: number
}

const MARGIN = 0.4

/** Arrows at the edge of the view for each trouble out of it. */
export function markers(state: DayState, view: View): Marker[] {
  const centre = { x: view.x + view.width / 2, y: view.y + view.height / 2 }
  return state.employees
    .filter((e) => trouble(state, e) && !inView(view, e.position))
    .map((e) => {
      const angle = Math.atan2(e.position.y - centre.y, e.position.x - centre.x)
      return {
        angle,
        at: {
          x: clamp(e.position.x, view.x + MARGIN, view.x + view.width - MARGIN),
          y: clamp(
            e.position.y,
            view.y + MARGIN,
            view.y + view.height - MARGIN,
          ),
        },
      }
    })
}

const FIRST_HOUR = 9
const HOURS = 8
const MINUTES_PER_HOUR = 60

/** The game's clock as the office reads it, 09:00 to 17:00 (R-GAME-3). */
export function clockText(clock: number, dayLength: number): string {
  const minutes = Math.floor((clock / dayLength) * HOURS * MINUTES_PER_HOUR)
  const hour = FIRST_HOUR + Math.floor(minutes / MINUTES_PER_HOUR)
  const minute = minutes % MINUTES_PER_HOUR
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const PICK_RADIUS = 0.8

/** Where on the floor a point of the canvas falls, `scale` pixels to a
 * tile. */
export function toFloor(view: View, scale: number, pixel: Spot): Spot {
  return { x: view.x + pixel.x / scale, y: view.y + pixel.y / scale }
}

/** The grey employee on the floor at `at`, if any: whom a tap chooses for a
 * masterclass (R-GAME-11, R-GAME-12). */
export function greyAt(state: DayState, at: Spot): Employee | undefined {
  return state.employees.find(
    (employee) =>
      employee.spirit === 'grey' &&
      employee.doing.kind !== 'away' &&
      Math.hypot(employee.position.x - at.x, employee.position.y - at.y) <=
        PICK_RADIUS,
  )
}
