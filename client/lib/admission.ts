import type { Challenge } from './human-check'

export type LinkRequestState =
  'check-email' | 'access-requested' | 'not-approved' | 'human-check'

export interface LinkRequest {
  state: LinkRequestState
  handle?: string
  inviteRefused?: true
  challenge?: Challenge
}

/** The server's `429`: too many sign-in requests from this network for now
 * (R-NFR-8). */
export class TooManyRequests extends Error {
  constructor() {
    super('too many sign-in requests')
  }
}

const HANDLE_KEY = 'rm_applicant_handle'

/** Tells the server an invite link was opened, so opens can be counted per
 * code with nothing about who opened it (R-STAT-6, ADR 0038). Nothing waits
 * on it, and a failure changes nothing for the visitor. */
export function noteInviteOpened(invite: string): void {
  fetch('/auth/invite-opened', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invite }),
  }).catch(() => undefined)
}

/** Asks for a sign-in link, carrying the deep link, the QR's invite token and
 * a solved human check; the answer says which screen comes next (F1, F4, F15,
 * R-AUTH-13, R-NFR-8). */
export async function requestLink(
  email: string,
  carried: { next: string | null; invite: string | null; altcha?: string },
): Promise<LinkRequest> {
  const response = await fetch('/auth/request-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      ...(carried.next === null ? {} : { next: carried.next }),
      ...(carried.invite === null ? {} : { invite: carried.invite }),
      ...(carried.altcha === undefined ? {} : { altcha: carried.altcha }),
    }),
  })
  if (response.status === 429) throw new TooManyRequests()
  if (!response.ok) {
    throw new Error(`link request failed (${String(response.status)})`)
  }
  return (await response.json()) as LinkRequest
}

/** Keeps the applicant's handle for the access-requested screen, for this tab
 * only; a request that brought none forgets any earlier one, which may be
 * someone else's on a shared phone. A browser refusing storage just loses the
 * optional form (R-AUTH-12). */
export function keepHandle(handle: string | undefined): void {
  try {
    if (handle === undefined) sessionStorage.removeItem(HANDLE_KEY)
    else sessionStorage.setItem(HANDLE_KEY, handle)
  } catch {
    // Storage refused: the request is recorded either way.
  }
}

export function keptHandle(): string | null {
  try {
    return sessionStorage.getItem(HANDLE_KEY)
  } catch {
    return null
  }
}

/** Adds the applicant's name and organization for the host (R-AUTH-11,12).
 * 'gone' when the request is no longer pending or the handle does not hold. */
export async function describeApplicant(
  handle: string,
  details: { name: string; org: string },
): Promise<'saved' | 'gone'> {
  const response = await fetch('/auth/applicant', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ handle, ...details }),
  })
  if (response.status === 404) return 'gone'
  if (!response.ok) {
    throw new Error(`saving details failed (${String(response.status)})`)
  }
  return 'saved'
}
