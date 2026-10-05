import { day } from './when'

const notices = new Map([
  ['expired', 'That sign-in link has expired.'],
  ['used', 'That sign-in link has already been used.'],
  ['unknown', 'That sign-in link is not valid.'],
])

/** What to tell someone sent back from the sign-in screen with a dead link, or
 * null when they were not (R-AUTH-6). */
export function linkNotice(search: string): string | null {
  const reason = new URLSearchParams(search).get('link')
  const notice = reason === null ? undefined : notices.get(reason)

  return notice === undefined
    ? null
    : `${notice} Enter your email and we will send you a new one.`
}

/** What to tell someone who has just deleted their own account, with the day
 * it will be erased, or null when they have not (R-PROF-2, ADR 0032). */
export function accountNotice(search: string): string | null {
  const query = new URLSearchParams(search)
  if (query.get('account') !== 'deleted') return null
  const until = query.get('until')
  const erased =
    until === null
      ? 'It will be erased for good'
      : `It will be erased for good on ${day(until)}`
  return (
    `Your account is deleted and hidden from everyone. ${erased}. ` +
    'Changed your mind? Ask for a sign-in link below before then and keep it.'
  )
}
