/** One paragraph of versioned words, under a short heading from the
 * versions written for ADR 0041 on (R-LOOK-4). */
export type Paragraph = string | { heading: string; text: string }

/** Each consent version's words (R-ONB-3, R-ONB-5). Accepted words never
 * change: new words get a new version, accepted again (R-ONB-4). Shared with
 * the client so the screen shows what `consent_version` records. */
export const consentTexts: Readonly<Record<string, readonly Paragraph[]>> = {
  '2026-11-01': [
    'Rebel Match is closed: membership is by invitation, from the host’s list or an event invite link.',
    'We keep your email address, the name you give, and anything optional you add, such as your job title and organization. Your name, job title and organization appear on the match cards other members see.',
    'Your email address is shared with another member only when both of you accept a connection. Until then nobody sees it, and a declined request reveals nothing.',
    'You can ask to be removed at any time by emailing the host. We then delete your account together with your challenges and connection requests.',
  ],
  '2026-11-01.2': [
    'Rebel Match is closed: membership is by invitation, from the host’s list or an event invite link.',
    'We keep your email address, the name you give, and anything optional you add to your profile, such as your job title, organization, sector and company size. Your name, organization and other profile information may be seen by other members of Rebel Match.',
    'Your email address is shared with another member only when both of you accept a connection. Until then nobody sees it, and a declined request reveals nothing.',
    'You can ask to be removed at any time by emailing the host. We then delete your account together with your challenges and connection requests.',
  ],
  '2026-11-01.3': [
    'Rebel Match is closed: membership is by invitation, from the host’s list or an event invite link.',
    'We keep your email address, the name you give, and anything optional you add to your profile, such as your job title, organization, sector and company size. Your name, organization and other profile information may be seen by other members of Rebel Match.',
    'Your email address is shared with another member only when both of you accept a connection. Until then nobody sees it, and a declined request reveals nothing.',
    'We record your activity in the app, such as which challenges you are shown and how you respond, so that its features work, and keep it as long as your account exists. The app may show figures that combine many members’ activity, such as how often a challenge was viewed. We share your personal data with other members only where a feature needs it, such as your match card or a connection you both accept. You can delete your activity history at any time.',
    'You can ask to be removed at any time by emailing the host. We then delete your account together with your challenges and connection requests.',
  ],
  '2026-11-01.4': [
    {
      heading: 'Who is responsible',
      text: 'Transformation Architects GmbH, c/o Impact Hub Zürich AG, Sihlquai 131, 8005 Zürich, runs Rebel Match and is responsible for your data. Contact: ready@transformation-architects.ch.',
    },
    {
      heading: 'Who can join',
      text: 'Rebel Match is closed: membership is by invitation, from the host’s list or an event invite link.',
    },
    {
      heading: 'What we keep',
      text: 'Your email address, your name, and anything optional you add to your profile: job title, organization, sector and company size.',
    },
    {
      heading: 'Who sees it',
      text: 'Your name, organization and other profile information may be seen by other members of Rebel Match. Your email address is shared with another member only when both of you accept a connection. Until then nobody sees it, and a declined request reveals nothing.',
    },
    {
      heading: 'Your activity',
      text: 'We record your activity in the app, such as which challenges you are shown and how you respond, so that its features work, and keep it as long as your account exists. The app may show figures that combine many members’ activity, such as how often a challenge was viewed. We share your personal data with other members only where a feature needs it, such as your match card or a connection you both accept. You can delete your activity history at any time.',
    },
    {
      heading: 'Your rights',
      text: 'You can ask for a copy of your data or have it corrected by writing to us. You can delete your activity history or your account yourself under Profile & privacy, in the menu. The rest is in the full privacy notice.',
    },
  ],
}

export const latestConsentVersion = '2026-11-01.4'

/** The words of a version, or none for a version without words: own keys
 * only, so `constructor` and friends never read as consent. */
export function consentWordsOf(version: string): readonly Paragraph[] {
  return Object.hasOwn(consentTexts, version)
    ? (consentTexts[version] ?? [])
    : []
}
