import { ensureOk, jsonOf, send } from './request'

/** The signed-in member as `/auth/me` describes them (R-ROLE-4). */
export interface Me {
  id: string
  name: string | null
  onboarded: boolean
  analyticsOptIn: boolean
  roles: string[]
  permissions: string[]
}

let current: Promise<Me | null> | null = null

async function fetchMe(): Promise<Me | null> {
  const response = await send('/auth/me')
  if (response.status === 401) return null
  return jsonOf<Me>(response, 'session unavailable')
}

/** Who is signed in, asked of the server once per page load. A failed
 * answer is not kept, so the next navigation asks again. */
export function loadMe(): Promise<Me | null> {
  current ??= fetchMe().catch((error: unknown) => {
    current = null
    throw error
  })
  return current
}

/** Ends the session on the server and forgets it here. Throws when the
 * server did not end it, so nobody is told they signed out when they did not. */
export async function signOut(): Promise<void> {
  ensureOk(await send('/auth/logout', 'POST'), 'sign-out failed')
  current = null
}

/** Drops what this page load knows about the member, so the next navigation
 * asks the server again: after onboarding, say, when `onboarded` has changed. */
export function forgetMe(): void {
  current = null
}
