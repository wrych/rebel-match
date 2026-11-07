/** The networks a member may link their profile to (R-PROF-5). Shared with
 * the client, so the form and the server read a link the same way (R-CFG-2). */
export const socialNetworks = ['linkedin', 'instagram'] as const

export type SocialNetwork = (typeof socialNetworks)[number]

/** A member's links, each an `https` address on its network's site or null. */
export type SocialLinks = Record<SocialNetwork, string | null>

/** What reading one typed link came to: cleared, an address, or refused. */
export type LinkReading =
  { result: 'blank' } | { result: 'link'; url: string } | { result: 'invalid' }

const INSTAGRAM_HANDLE = /^@([A-Za-z0-9._]{1,30})$/
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

function onSite(network: SocialNetwork, host: string): boolean {
  if (network === 'linkedin')
    return host === 'linkedin.com' || host.endsWith('.linkedin.com')
  return host === 'instagram.com' || host === 'www.instagram.com'
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
const INSTAGRAM_PROFILE = /^\/([A-Za-z0-9._]{1,30})\/?$/
// Instagram pages that sit where a handle would, never a member's profile.
const INSTAGRAM_PAGES = new Set([
  'about',
  'accounts',
  'direct',
  'explore',
  'p',
  'reel',
  'reels',
  'stories',
  'tv',
])

function profileAddress(network: SocialNetwork, path: string): string | null {
  if (network === 'linkedin') {
    const slug = LINKEDIN_PROFILE.exec(path)?.[1]
    return slug === undefined ? null : `https://www.linkedin.com/in/${slug}`
  }
  const handle = INSTAGRAM_PROFILE.exec(path)?.[1]
  if (handle === undefined || INSTAGRAM_PAGES.has(handle.toLowerCase()))
    return null
  return `https://www.instagram.com/${handle}`
}

function addressOf(network: SocialNetwork, text: string): string | null {
  const handle =
    network === 'instagram' ? INSTAGRAM_HANDLE.exec(text)?.[1] : undefined
  if (handle !== undefined) return profileAddress(network, `/${handle}`)
  const url = parsed(text)
  if (url === null || !isPlainWebAddress(url)) return null
  if (!onSite(network, url.hostname)) return null
  return profileAddress(network, url.pathname)
}

/** Reads what a member typed as a link to their profile on `network`: blank
 * clears it; otherwise only a profile address on that network's own site,
 * saved as its canonical `https` address, or an Instagram `@handle`
 * (R-PROF-5). */
export function readSocialLink(
  network: SocialNetwork,
  typed: string,
  maxChars: number,
): LinkReading {
  const text = typed.trim()
  if (text === '') return { result: 'blank' }
  const url = text.length > maxChars ? null : addressOf(network, text)
  if (url === null || url.length > maxChars) return { result: 'invalid' }
  return { result: 'link', url }
}

/** How a saved link reads beside its network's logo: LinkedIn's path, such
 * as `/in/ada`, and an Instagram `@handle` (R-PROF-5). */
export function handleOf(network: SocialNetwork, url: string): string {
  const path = new URL(url).pathname.replace(/\/+$/, '')
  if (network === 'linkedin') return path
  return `@${path.split('/')[1] ?? ''}`
}
