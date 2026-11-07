import type { IssuedCode } from '../../src/services/live-codes'
import type { OpenedCode, ProfileCode } from '../../src/services/profile-codes'
import { findJson, jsonOf, send } from './request'

export type { IssuedCode, OpenedCode, ProfileCode }

/** Whether codes are offered: hosts have them on (R-CODE-1). */
export const codesOpen = (connectCodes: number): boolean => connectCodes === 1

/** The token a code's address carries in its fragment, `#t=…`, or null. */
export function tokenOf(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('t')
  return token === null || token === '' ? null : token
}

const withToken = (path: string, token: string): string =>
  `${path}#t=${encodeURIComponent(token)}`

/** Where a profile code opens its owner's card (S45, R-CODE-3). */
export const profileCodePath = (token: string): string => withToken('/p', token)

/** Where a profile code's owner is asked to connect (S46, R-CODE-3). */
export const profileConnectPath = (token: string): string =>
  withToken('/p/connect', token)

/** The link a profile code's QR holds, Copy link copies and Share shares. */
export const profileCodeLink = (origin: string, token: string): string =>
  `${origin}${profileCodePath(token)}`

/** The member's own profile code, made on first asking; null while hosts
 * have codes off (R-CODE-2). */
export function fetchProfileCode(): Promise<ProfileCode | null> {
  return findJson<ProfileCode>('/api/me/profile-code', 'code unavailable')
}

/** Turns the member's profile code on or off, the same code (R-CODE-4). */
export async function setProfileCode(enabled: boolean): Promise<ProfileCode> {
  const response = await send('/api/me/profile-code', 'PATCH', { enabled })
  return jsonOf<ProfileCode>(response, 'code not saved')
}

/** Replaces the member's profile code at once (R-CODE-4). */
export async function resetProfileCode(): Promise<ProfileCode> {
  const response = await send('/api/me/profile-code/reset', 'POST')
  return jsonOf<ProfileCode>(response, 'code not reset')
}

/** The owner of a usable profile code, the token sent in the body; null
 * for any code that cannot be used (R-CODE-3, R-NFR-9). */
export async function openProfileCode(
  token: string,
): Promise<OpenedCode | null> {
  const response = await send('/api/profile-codes/open', 'POST', { token })
  if (response.status === 404) return null
  return jsonOf<OpenedCode>(response, 'code unavailable')
}

/** The link a live code's QR holds (R-CODE-5). */
export const liveCodeLink = (origin: string, token: string): string =>
  `${origin}${withToken('/c', token)}`

/** A new live code; `limit` past the minute's allowance; `off` while hosts
 * have codes off (R-CODE-5). */
export type LiveCodeAnswer =
  | { result: 'issued'; code: IssuedCode }
  | { result: 'limit' }
  | { result: 'off' }

/** Asks for the owner's next live code. */
export async function issueLiveCode(): Promise<LiveCodeAnswer> {
  const response = await send('/api/me/live-codes', 'POST')
  if (response.status === 429) return { result: 'limit' }
  if (response.status === 404) return { result: 'off' }
  return {
    result: 'issued',
    code: await jsonOf<IssuedCode>(response, 'code unavailable'),
  }
}

/** What scanning a live code came to: the connection to open, a code that
 * cannot be used, or codes off (R-CODE-6, R-CODE-7). */
export type Redeemed =
  | { result: 'connected'; id: string }
  | { result: 'expired' }
  | { result: 'off' }

/** Scans a live code, its token in the body (R-NFR-9). */
export async function redeemLiveCode(token: string): Promise<Redeemed> {
  const response = await send('/api/live-codes/redeem', 'POST', { token })
  if (response.status === 410) return { result: 'expired' }
  if (response.status === 404) return { result: 'off' }
  const { id } = await jsonOf<{ id: string }>(response, 'code not used')
  return { result: 'connected', id }
}
