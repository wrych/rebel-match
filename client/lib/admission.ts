export type LinkRequestState =
  'check-email' | 'access-requested' | 'not-approved'

export interface LinkRequest {
  state: LinkRequestState
  handle?: string
  inviteRefused?: true
}

const HANDLE_KEY = 'rm_applicant_handle'

/** Asks for a sign-in link, carrying the deep link and the QR's invite token;
 * the answer says which screen comes next (F1, F4, F15, R-AUTH-13). */
export async function requestLink(
  email: string,
  carried: { next: string | null; invite: string | null },
): Promise<LinkRequest> {
  const response = await fetch('/auth/request-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      ...(carried.next === null ? {} : { next: carried.next }),
      ...(carried.invite === null ? {} : { invite: carried.invite }),
    }),
  })
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
