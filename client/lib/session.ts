/** The signed-in member as `/auth/me` describes them (R-ROLE-4). */
export interface Me {
  id: string
  name: string | null
  onboarded: boolean
  roles: string[]
  permissions: string[]
}

let current: Promise<Me | null> | null = null

async function fetchMe(): Promise<Me | null> {
  const response = await fetch('/auth/me')
  if (response.status === 401) return null
  if (!response.ok)
    throw new Error(`session unavailable (${String(response.status)})`)
  return (await response.json()) as Me
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
  const response = await fetch('/auth/logout', { method: 'POST' })
  if (!response.ok) {
    throw new Error(`sign-out failed (${String(response.status)})`)
  }
  current = null
}
