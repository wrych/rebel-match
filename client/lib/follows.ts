import type { Trend } from '../../src/services/challenges'

/** The trends the member follows (R-ASK-9, R-MINE-3). */
export async function fetchFollowed(): Promise<Trend[]> {
  const response = await fetch('/api/follows')
  if (!response.ok)
    throw new Error(`follows unavailable (${String(response.status)})`)
  return ((await response.json()) as { trends: Trend[] }).trends
}

/** Follows or unfollows a trend; doing either twice changes nothing. */
export async function setFollowing(
  trendId: string,
  following: boolean,
): Promise<void> {
  const response = await fetch(`/api/follows/${encodeURIComponent(trendId)}`, {
    method: following ? 'POST' : 'DELETE',
  })
  if (!response.ok)
    throw new Error(`follow not saved (${String(response.status)})`)
}
