import type { Job } from '../../src/game/levels'
import type { Leaderboard } from '../../src/services/game'

export type { Job, Leaderboard }

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
