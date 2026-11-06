import type { CardFacts, MemberCard } from './member-search.js'
import { canReach } from './reach.js'

/** A member's profile code as they see it (R-CODE-2). */
export interface ProfileCode {
  token: string
  enabled: boolean
}

export interface ProfileCodeStore {
  /** The member's code, or null before they have one. */
  find(memberId: string): Promise<ProfileCode | null>
  /** Gives the member `token` as a new code, on, unless they have one;
   * the code they hold after. */
  create(memberId: string, token: string): Promise<ProfileCode>
  /** Turns the code on or off, keeping its token; null without one. */
  setEnabled(memberId: string, enabled: boolean): Promise<ProfileCode | null>
  /** Replaces the token at once, keeping on or off; null without one. */
  replaceToken(memberId: string, token: string): Promise<ProfileCode | null>
  /** The owner of the code `token` while it is on, else null. */
  ownerOf(token: string): Promise<string | null>
}

/** A profile code opened: whose it is, and their card (R-CODE-3). */
export interface OpenedCode {
  memberId: string
  card: MemberCard
}

export interface ProfileCodeService {
  /** The member's code, made on first asking (R-CODE-2). */
  mine(memberId: string): Promise<ProfileCode>
  /** On or off, the same token (R-CODE-4). */
  setEnabled(memberId: string, enabled: boolean): Promise<ProfileCode>
  /** A new token at once; the old one is not found from now (R-CODE-4). */
  reset(memberId: string): Promise<ProfileCode>
  /** The owner's card for a usable code that is not the caller's own; null
   * for any other, saying nothing about the owner (R-CODE-3). */
  open(callerId: string, token: string): Promise<OpenedCode | null>
}

/** Profile codes (R-CODE-2..4, ADR 0063): a random token, never the
 * member's id, that reaches its owner while on; reset is what stops a
 * code shared too widely. */
export function createProfileCodes(deps: {
  store: ProfileCodeStore
  cards: { card(memberId: string): Promise<CardFacts | null> }
  newToken: () => string
}): ProfileCodeService {
  const { store } = deps
  const mine = async (memberId: string): Promise<ProfileCode> =>
    (await store.find(memberId)) ?? store.create(memberId, deps.newToken())
  return {
    mine,
    setEnabled: async (memberId, enabled) => {
      await mine(memberId)
      return (await store.setEnabled(memberId, enabled)) ?? mine(memberId)
    },
    reset: async (memberId) => {
      await mine(memberId)
      const token = deps.newToken()
      return (await store.replaceToken(memberId, token)) ?? mine(memberId)
    },
    open: async (callerId, token) => {
      const owner = await store.ownerOf(token)
      const facts = owner === null ? null : await deps.cards.card(owner)
      if (owner === null || facts === null) return null
      const reached = canReach({
        isCaller: owner === callerId,
        reachable: facts.reachable,
        findable: facts.findable,
        searchOn: false,
        presentsCode: true,
        codesOn: true,
      })
      return reached ? { memberId: owner, card: facts.card } : null
    },
  }
}
