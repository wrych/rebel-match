/** The networks a member may link their profile to (R-PROF-5). Shared with
 * the client, so the form and the server read a link the same way (R-CFG-2). */
export const socialNetworks = ['linkedin'] as const

export type SocialNetwork = (typeof socialNetworks)[number]

/** A member's links, each an `https` address on its network's site or null. */
export type SocialLinks = Record<SocialNetwork, string | null>

/** What reading one typed link came to: cleared, an address, or refused. */
export type LinkReading =
  { result: 'blank' } | { result: 'link'; url: string } | { result: 'invalid' }

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

function onLinkedIn(host: string): boolean {
  return host === 'linkedin.com' || host.endsWith('.linkedin.com')
}

function withScheme(text: string): string {
  return SCHEME.test(text) ? text : `https://${text}`
}

function parsed(text: string): URL | null {
  try {
    return new URL(withScheme(text))
  } catch {
    return null
  }
}

function isPlainWebAddress(url: URL): boolean {
  return (
    ['https:', 'http:'].includes(url.protocol) &&
    url.username === '' &&
    url.password === '' &&
    url.port === ''
  )
}

const LINKEDIN_PROFILE = /^\/in\/([A-Za-z0-9%_.-]{1,100})\/?$/
function profileAddress(path: string): string | null {
  const slug = LINKEDIN_PROFILE.exec(path)?.[1]
  return slug === undefined ? null : `https://www.linkedin.com/in/${slug}`
}

function addressOf(text: string): string | null {
  const url = parsed(text)
  if (url === null || !isPlainWebAddress(url)) return null
  if (!onLinkedIn(url.hostname)) return null
  return profileAddress(url.pathname)
}

/** Reads what a member typed as a link to their LinkedIn profile: blank
 * clears it; otherwise only a profile address on LinkedIn's own site,
 * saved as its canonical `https` address (R-PROF-5). */
export function readSocialLink(typed: string, maxChars: number): LinkReading {
  const text = typed.trim()
  if (text === '') return { result: 'blank' }
  const url = text.length > maxChars ? null : addressOf(text)
  if (url === null || url.length > maxChars) return { result: 'invalid' }
  return { result: 'link', url }
}

/** How a saved link reads beside its network's logo: LinkedIn's path, such
 * as `/in/ada` (R-PROF-5). */
export function handleOf(url: string): string {
  return new URL(url).pathname.replace(/\/+$/, '')
}
