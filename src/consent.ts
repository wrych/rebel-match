/**
 * The data-usage consent, one entry per version (R-ONB-3, R-ONB-5). A version
 * is what a member accepts and what `consent_version` records, so its words
 * never change once members have accepted it: new words get a new version,
 * and members accept again (R-ONB-4). Shared with the client, like the route
 * table, so the screen shows exactly the words the server records.
 *
 * The wording below is a draft that states what R-ONB-5 requires; who owns
 * the final legal copy is still open (requirements, open question 1).
 */
export const consentTexts: Readonly<Record<string, readonly string[]>> = {
  '2026-11-01': [
    'Rebel Match is closed: membership is by invitation, from the host’s list or an event invite link.',
    'We keep your email address, the name you give, and anything optional you add, such as your job title and organization. Your name, job title and organization appear on the match cards other members see.',
    'Your email address is shared with another member only when both of you accept a connection. Until then nobody sees it, and a declined request reveals nothing.',
    'You can ask to be removed at any time by emailing the host. We then delete your account together with your challenges and connection requests.',
  ],
}

export const latestConsentVersion = '2026-11-01'
