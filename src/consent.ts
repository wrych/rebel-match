/** Each consent version's words (R-ONB-3, R-ONB-5). Accepted words never
 * change: new words get a new version, accepted again (R-ONB-4). Shared with
 * the client so the screen shows what `consent_version` records. */
export const consentTexts: Readonly<Record<string, readonly string[]>> = {
  '2026-11-01': [
    'Rebel Match is closed: membership is by invitation, from the host’s list or an event invite link.',
    'We keep your email address, the name you give, and anything optional you add, such as your job title and organization. Your name, job title and organization appear on the match cards other members see.',
    'Your email address is shared with another member only when both of you accept a connection. Until then nobody sees it, and a declined request reveals nothing.',
    'You can ask to be removed at any time by emailing the host. We then delete your account together with your challenges and connection requests.',
  ],
}

export const latestConsentVersion = '2026-11-01'

/** The words of a version, or none for a version without words: own keys
 * only, so `constructor` and friends never read as consent. */
export function consentWordsOf(version: string): readonly string[] {
  return Object.hasOwn(consentTexts, version)
    ? (consentTexts[version] ?? [])
    : []
}
