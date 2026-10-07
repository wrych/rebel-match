import type { Job } from '../../src/game/levels'
import type { GameState, Leaderboard } from '../../src/services/game'

export type { GameState, Job, Leaderboard }

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
  const response = await fetch('/api/game/leaderboard')
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(`leaderboard unavailable (${String(response.status)})`)
  return (await response.json()) as Leaderboard
}

/** Whether the game is open to this member: on, and theirs to play. Asks
 * without making a player (R-GAME-1). */
export async function gameOpen(): Promise<boolean> {
  try {
    return (await fetch('/api/game/door')).status === 204
  } catch {
    return false
  }
}

/** The player's state, or null while the game is off (R-GAME-16). */
export async function fetchGame(): Promise<GameState | null> {
  const response = await fetch('/api/game')
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(`game unavailable (${String(response.status)})`)
  return (await response.json()) as GameState
}

/** Shows the member's name on the board, or the pseudonym (R-GAME-15). */
export async function shareName(shared: boolean): Promise<void> {
  const response = await fetch('/api/game/sharing', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shared }),
  })
  if (!response.ok)
    throw new Error(`sharing not saved (${String(response.status)})`)
}
