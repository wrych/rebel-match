import { trackNothing, type Track } from './analytics.js'
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

interface Opening {
  store: ProfileCodeStore
  cards: {
    card(viewerId: string, memberId: string): Promise<CardFacts | null>
  }
}

async function opening(
  deps: Opening,
  callerId: string,
  token: string,
): Promise<OpenedCode | null> {
  const owner = await deps.store.ownerOf(token)
  const facts = owner === null ? null : await deps.cards.card(callerId, owner)
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
}

/** Profile codes (R-CODE-2..4, ADR 0063): a random token, never the
 * member's id, that reaches its owner while on; reset is what stops a
 * code shared too widely. Its usage events name the code, never the token
 * or who (R-CODE-9). */
export function createProfileCodes(
  deps: Opening & {
    newToken: () => string
    track?: Track
  },
): ProfileCodeService {
  const { store } = deps
  const track = deps.track ?? trackNothing
  const made = async (memberId: string): Promise<ProfileCode> =>
    (await store.find(memberId)) ?? store.create(memberId, deps.newToken())
  const shown = (memberId: string, code: ProfileCode): ProfileCode => {
    void track(memberId, { name: 'connect_code_shown', code: 'profile' })
    return code
  }
  return {
    mine: async (memberId) => shown(memberId, await made(memberId)),
    setEnabled: async (memberId, enabled) => {
      await made(memberId)
      return (await store.setEnabled(memberId, enabled)) ?? made(memberId)
    },
    reset: async (memberId) => {
      await made(memberId)
      const token = deps.newToken()
      const code =
        (await store.replaceToken(memberId, token)) ?? (await made(memberId))
      return shown(memberId, code)
    },
    open: async (callerId, token) => {
      const opened = await opening(deps, callerId, token)
      void track(callerId, {
        name: 'connect_code_opened',
        code: 'profile',
        outcome: opened === null ? 'expired' : 'opened',
      })
      return opened
    },
  }
}
