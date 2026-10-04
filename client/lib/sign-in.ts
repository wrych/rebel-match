export type SignInResult =
  | { ok: true; next: string }
  | { ok: false; reason: 'expired' | 'used' | 'unknown' }

const REASONS = new Set(['expired', 'used', 'unknown'])

/** The token the emailed link carries in its fragment, or null (ADR 0027). */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token')
  return token === null || token === '' ? null : token
}

/** Uses the token: the one step that signs a member in (R-AUTH-5). Throws
 * when the server could not answer, so a network hiccup is not reported as
 * a dead link. */
export async function signIn(token: string): Promise<SignInResult> {
  const response = await fetch('/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (response.ok) {
    const { next } = (await response.json()) as { next: string }
    return { ok: true, next }
  }
  if (response.status === 400) {
    const { reason } = (await response.json()) as { reason?: string }
    return {
      ok: false,
      reason: REASONS.has(reason ?? '')
        ? (reason as 'expired' | 'used' | 'unknown')
        : 'unknown',
    }
  }
  throw new Error(`sign-in failed (${String(response.status)})`)
}
