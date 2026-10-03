import type { ConnectionService, RequestOutcome } from './connections.js'

export type SwipeAction = 'same_boat' | 'been_there' | 'follow' | 'skip'

export interface SwipeInput {
  challengeId: string
  action: SwipeAction
  note?: string | undefined
}

/** A card the viewer may swipe: someone else's active challenge. */
export interface SwipeTarget {
  authorId: string
  trendId: string
}

export interface SwipeStore {
  /** The challenge as a card for `viewerId`, or null when it is gone or
   * their own (R-OFF-1). */
  target(challengeId: string, viewerId: string): Promise<SwipeTarget | null>
  record(
    memberId: string,
    challengeId: string,
    action: SwipeAction,
  ): Promise<void>
  follow(memberId: string, trendId: string): Promise<void>
}

export type SwipeOutcome =
  | {
      result: 'recorded'
      connection?: Exclude<RequestOutcome, { result: 'not_found' }>
    }
  | { result: 'not_found' }

export interface SwipeService {
  swipe(memberId: string, input: SwipeInput): Promise<SwipeOutcome>
}

/** F6's four answers to a card (R-OFF-3). Same boat and been there ask the
 * author to connect through the double opt-in, never by revealing anyone
 * (ADR 0004); follow follows the card's trend; skip only moves on. Each is
 * recorded, so the card is not dealt again (R-OFF-2). */
export function createSwipes(deps: {
  store: SwipeStore
  connections: Pick<ConnectionService, 'request'>
}): SwipeService {
  return {
    swipe: async (memberId, input) => {
      const target = await deps.store.target(input.challengeId, memberId)
      if (target === null) return { result: 'not_found' }

      let recorded: SwipeOutcome = { result: 'recorded' }
      if (input.action === 'same_boat' || input.action === 'been_there') {
        const connection = await deps.connections.request(memberId, {
          targetId: target.authorId,
          challengeId: input.challengeId,
          kind: input.action,
          message: input.note,
        })
        if (connection.result === 'not_found') return { result: 'not_found' }
        recorded = { result: 'recorded', connection }
      }
      if (input.action === 'follow') {
        await deps.store.follow(memberId, target.trendId)
      }
      await deps.store.record(memberId, input.challengeId, input.action)
      return recorded
    },
  }
}
