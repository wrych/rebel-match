import type { DayState, Employee } from './state'

/** What a file does to the employee who gets it in boss mode: a rebel turns
 * tempted, anyone else grey and busy with it for a while, and a tempted one
 * counts as crushed (R-GAME-4). */
export function workOn(state: DayState, employee: Employee): void {
  if (employee.spirit === 'rebel') {
    employee.spirit = 'tempted'
    employee.temptedAt = state.clock
    return
  }
  if (employee.spirit === 'tempted') state.score += 1
  employee.spirit = 'grey'
  employee.workingUntil = state.clock + state.tuning.fileWorkSeconds
}

/** Hands an employee sitting down the file left on their desk, in boss
 * mode. */
export function takeUpLeftFile(state: DayState, employee: Employee): void {
  if (state.mode !== 'boss' || !employee.file) return
  employee.file = false
  workOn(state, employee)
}
