import type { Trend } from '../../src/services/challenges'
import { ensureOk, getJson, send } from './request'

/** The trends the member follows (R-ASK-9, R-MINE-3). */
export async function fetchFollowed(): Promise<Trend[]> {
  const { trends } = await getJson<{ trends: Trend[] }>(
    '/api/follows',
    'follows unavailable',
  )
  return trends
}

/** Follows or unfollows a trend; doing either twice changes nothing. */
export async function setFollowing(
  trendId: string,
  following: boolean,
): Promise<void> {
  const response = await send(
    `/api/follows/${encodeURIComponent(trendId)}`,
    following ? 'POST' : 'DELETE',
  )
  ensureOk(response, 'follow not saved')
}
