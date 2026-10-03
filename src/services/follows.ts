import type { Trend } from './challenges.js'

export interface FollowStore {
  follow(memberId: string, trendId: string): Promise<void>
  unfollow(memberId: string, trendId: string): Promise<void>
  followed(memberId: string): Promise<Trend[]>
}

export interface FollowService {
  follow(
    memberId: string,
    trendId: string,
  ): Promise<'followed' | 'unknown_trend'>
  unfollow(memberId: string, trendId: string): Promise<void>
  followed(memberId: string): Promise<Trend[]>
}

/** F9: follow and unfollow a trend, and list the ones followed (R-ASK-9,
 * R-MINE-3). Following twice, or unfollowing what is not followed, changes
 * nothing. */
export function createFollows(deps: {
  store: FollowStore
  trends: () => Promise<Trend[]>
}): FollowService {
  return {
    follow: async (memberId, trendId) => {
      const known = (await deps.trends()).some((t) => t.id === trendId)
      if (!known) return 'unknown_trend'
      await deps.store.follow(memberId, trendId)
      return 'followed'
    },
    unfollow: (memberId, trendId) => deps.store.unfollow(memberId, trendId),
    followed: (memberId) => deps.store.followed(memberId),
  }
}
