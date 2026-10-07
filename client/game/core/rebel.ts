import { FIRST_REBEL_LEVEL } from '../../../src/game/levels'
import { pick } from './random'
import { HEAT, draw, floorFor, type DayState, type Employee } from './state'
import { present, sendTo } from './walk'

const PERCENT = 100

/** Seconds between files at a level: shorter each level, never below the
 * floor (R-GAME-9). */
export function fileInterval(state: DayState): number {
  const tuning = state.tuning
  const levels = Math.max(0, state.level - FIRST_REBEL_LEVEL)
  const shrink = (1 - tuning['rebel.fileStepPercent'] / PERCENT) ** levels
  return Math.max(
    tuning['rebel.fileFloorSeconds'],
    tuning['rebel.fileEverySeconds'] * shrink,
  )
}

function canTakeFile(employee: Employee): boolean {
  return employee.spirit === 'rebel' && !employee.file && present(employee)
}

function landFiles(state: DayState): void {
  if (state.clock < state.nextFileAt) return
  state.nextFileAt = state.clock + fileInterval(state)
  const open = state.employees.filter(canTakeFile)
  const chosen = open[pick(draw(state), open.length)]
  if (chosen === undefined) return
  chosen.file = true
  chosen.heatAt = state.clock
}

// A file left on the desk heats its employee a stage at a time; past
// boiling they turn grey (R-GAME-9).
function heatUp(state: DayState, employee: Employee): void {
  if (!employee.file || employee.spirit !== 'rebel' || !present(employee))
    return
  if (state.clock - employee.heatAt < state.tuning['rebel.heatStageSeconds'])
    return
  employee.heatAt = state.clock
  if (employee.heat < HEAT.boiling) {
    employee.heat += 1
    return
  }
  employee.spirit = 'grey'
  employee.heat = HEAT.cool
}

/** Rebel mode's part of a step (R-GAME-9). */
export function rebelRules(state: DayState): void {
  landFiles(state)
  for (const employee of state.employees) heatUp(state, employee)
}

/** Sends an employee out of the entrance for a while: on a break, or to a
 * masterclass (R-GAME-10, R-GAME-11). */
export function sendAway(
  state: DayState,
  employee: Employee,
  then: 'break' | 'masterclass',
): void {
  const seconds =
    then === 'break'
      ? state.tuning['rebel.breakSeconds']
      : state.tuning['rebel.masterclassSeconds']
  sendTo(state, employee, floorFor(state).entrance, {
    kind: 'leaving',
    seconds,
    then,
  })
}

/** Turns a grey employee back into a rebel, cool, with any file on their
 * desk heating them again from now (R-GAME-11). */
export function rekindle(employee: Employee, clock: number): void {
  employee.spirit = 'rebel'
  employee.heat = HEAT.cool
  employee.heatAt = clock
}
