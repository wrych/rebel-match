import type { Spot } from './floors'
import { centreOf, distance, path, tileOf } from './grid'
import {
  EMPLOYEE_SPEED,
  floorFor,
  type DayState,
  type Doing,
  type Employee,
} from './state'

/** Sends an employee walking to a tile, doing `doing` on the way. */
export function sendTo(
  state: DayState,
  employee: Employee,
  tile: Spot,
  doing: Doing,
): void {
  employee.route = path(floorFor(state), tileOf(employee.position), tile).map(
    centreOf,
  )
  employee.doing = doing
}

/** Sends an employee back to their own chair. */
export function sendToDesk(state: DayState, employee: Employee): void {
  const seat = floorFor(state).cubicles[employee.cubicle]?.seat
  if (seat !== undefined) sendTo(state, employee, seat, { kind: 'toDesk' })
}

function advance(employee: Employee, dt: number): void {
  let budget = EMPLOYEE_SPEED * dt
  while (budget > 0) {
    const target = employee.route[0]
    if (target === undefined) return
    const gap = distance(employee.position, target)
    if (gap > budget) {
      const share = budget / gap
      employee.position = {
        x: employee.position.x + (target.x - employee.position.x) * share,
        y: employee.position.y + (target.y - employee.position.y) * share,
      }
      return
    }
    employee.position = target
    employee.route.shift()
    budget -= gap
  }
}

function comeBack(state: DayState, employee: Employee, then: string): void {
  employee.heat = 0
  employee.heatAt = state.clock
  if (then === 'masterclass') employee.spirit = 'rebel'
  sendToDesk(state, employee)
}

// What an employee does once the walk they were on is over.
function arrived(state: DayState, employee: Employee): void {
  const doing = employee.doing
  switch (doing.kind) {
    case 'arriving':
    case 'toDesk':
      employee.doing = { kind: 'atDesk' }
      return
    case 'toCooler':
      employee.doing = {
        kind: 'atCooler',
        cooler: doing.cooler,
        since: state.clock,
      }
      return
    case 'toMeeting':
      employee.doing = { kind: 'inMeeting' }
      return
    case 'leaving':
      employee.doing = {
        kind: 'away',
        until: state.clock + doing.seconds,
        then: doing.then,
      }
      return
    default:
      return
  }
}

function waiting(state: DayState, employee: Employee): boolean {
  const doing = employee.doing
  if (doing.kind === 'arriving') return state.clock < doing.from
  if (doing.kind !== 'away') return false
  if (state.clock >= doing.until) comeBack(state, employee, doing.then)
  return true
}

/** Walks everyone a step along their route, and settles those who arrive. */
export function walk(state: DayState, dt: number): void {
  for (const employee of state.employees) {
    if (waiting(state, employee) || employee.route.length === 0) continue
    advance(employee, dt)
    if (employee.route.length === 0) arrived(state, employee)
  }
}

/** Whether the employee is on the floor, not walking in or away. */
export function present(employee: Employee): boolean {
  const kind = employee.doing.kind
  return kind !== 'arriving' && kind !== 'leaving' && kind !== 'away'
}
