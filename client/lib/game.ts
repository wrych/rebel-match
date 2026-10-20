import type { DayRecord, Job } from '../../src/game/levels'
import type { DayResult, GameState, Leaderboard } from '../../src/services/game'
import { ensureOk, findJson, jsonOf, send } from './request'

export type { DayResult, GameState, Job, Leaderboard }

const jobNames: Readonly<Record<Job, string>> = {
  teamLead: 'Team Lead',
  manager: 'Manager',
  director: 'Director',
  vp: 'VP',
  ceo: 'CEO',
  rebel: 'Rebel',
}

/** A job as a player reads it. */
export const jobName = (job: Job): string => jobNames[job]

/** The leaderboard, or null while the game is off (R-GAME-13, R-GAME-17). */
export async function fetchLeaderboard(): Promise<Leaderboard | null> {
  return findJson<Leaderboard>(
    '/api/game/leaderboard',
    'leaderboard unavailable',
  )
}

/** Whether the game is open to this member: on, and theirs to play. Asks
 * without making a player (R-GAME-1). */
export async function gameOpen(): Promise<boolean> {
  try {
    return (await send('/api/game/door')).status === 204
  } catch {
    return false
  }
}

/** The player's state, or null while the game is off (R-GAME-16). */
export async function fetchGame(): Promise<GameState | null> {
  return findJson<GameState>('/api/game', 'game unavailable')
}

/** Shows the member's name on the board, or the pseudonym (R-GAME-15). */
export async function shareName(shared: boolean): Promise<void> {
  ensureOk(
    await send('/api/game/sharing', 'PUT', { shared }),
    'sharing not saved',
  )
}

/** Records a finished or abandoned day; null once the office has closed
 * (R-GAME-14, R-GAME-17). */
export async function recordDay(day: DayRecord): Promise<DayResult | null> {
  const response = await send('/api/game/days', 'POST', day)
  if (response.status === 404) return null
  return jsonOf<DayResult>(response, 'day not recorded')
}

/** Records a day left unfinished as the page goes away, where the browser
 * lets a last request through (R-GAME-14, R-GAME-16). */
export function abandonDay(level: number, playSeconds: number): void {
  const day: DayRecord = { level, outcome: 'abandoned', playSeconds }
  navigator.sendBeacon(
    '/api/game/days',
    new Blob([JSON.stringify(day)], { type: 'application/json' }),
  )
}

/** Marks a hint seen, so it shows once per member; a failure only means it
 * may show again (R-GAME-18). */
export function seeHint(hint: string): void {
  send(`/api/game/hints/${encodeURIComponent(hint)}`, 'PUT').catch(
    () => undefined,
  )
}
