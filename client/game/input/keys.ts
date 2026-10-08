import type { ActionKind } from '../core/actions'
import type { Spot } from '../core/floors'

const directions: Readonly<Record<string, Spot>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
}

/** Whether a key steers the player. */
export const steers = (code: string): boolean => Object.hasOwn(directions, code)

/** Where the held keys point, each axis from -1 to 1 (R-GAME-12). */
export function heading(held: ReadonlySet<string>): Spot {
  let x = 0
  let y = 0
  for (const code of held) {
    const direction = directions[code]
    if (direction === undefined) continue
    x += direction.x
    y += direction.y
  }
  return { x: Math.sign(x), y: Math.sign(y) }
}

/** What a key press does among the actions on offer: Space the first, E a
 * break, directly (R-GAME-12). */
export function keyAction(
  code: string,
  offered: readonly ActionKind[],
): ActionKind | undefined {
  if (code === 'KeyE') return offered.includes('break') ? 'break' : undefined
  if (code !== 'Space') return undefined
  return offered.find((kind) => kind !== 'break') ?? offered[0]
}

const labels: Readonly<Record<ActionKind, string>> = {
  takeFile: 'Take file',
  assign: 'Assign',
  leaveFile: 'Leave file',
  breakUp: 'Break it up',
  help: 'Help',
  break: 'Break',
  talk: 'Talk',
  masterclass: 'Masterclass',
  openDoor: 'Open door',
}

/** The action button's words (R-GAME-12). */
export const actionLabel = (kind: ActionKind): string => labels[kind]
