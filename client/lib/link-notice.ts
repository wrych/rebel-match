const notices = new Map([
  ['expired', 'That sign-in link has expired.'],
  ['used', 'That sign-in link has already been used.'],
  ['unknown', 'That sign-in link is not valid.'],
])

/** What to tell someone sent back from `/auth/verify` with a dead link, or
 * null when they were not (R-AUTH-6). */
export function linkNotice(search: string): string | null {
  const reason = new URLSearchParams(search).get('link')
  const notice = reason === null ? undefined : notices.get(reason)

  return notice === undefined
    ? null
    : `${notice} Enter your email and we will send you a new one.`
}
