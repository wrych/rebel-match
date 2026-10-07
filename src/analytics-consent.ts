import type { Paragraph } from './consent.js'

/** Each version of the analytics opt-in's words (R-ANA-4, ADR 0026). Like the
 * consent words, accepted words never change: new words get a new version, and
 * an opt-in given to older words no longer counts. Shared with the client. */
export const analyticsTexts: Readonly<Record<string, readonly Paragraph[]>> = {
  '2026-10-04': [
    'Optional. If you tick this, we record which screens and buttons you use, for example that you submitted a challenge or swiped a card, so we can see what works and what does not.',
    'These records go to Mixpanel, stored in the EU, under a random code instead of your name. They never contain your name, email address, organization or the words of your challenges.',
    'Leave it unticked and nothing about you is recorded. You can change your mind at any time on the welcome screen.',
  ],
  '2026-10-05': [
    'Optional. If you tick this, we record which screens and buttons you use, for example that you submitted a challenge or swiped a card, so we can see what works and what does not.',
    'These records go to Mixpanel, stored in the EU, under a random code instead of your name. They never contain your name, email address, organization or the words of your challenges.',
    'Leave it unticked and nothing about you is recorded. You can change your mind at any time under Profile & privacy, in the menu.',
  ],
  '2026-10-07': [
    {
      heading: 'What is recorded',
      text: 'Which screens and buttons you use, for example that you submitted a challenge or swiped a card.',
    },
    {
      heading: 'Why',
      text: 'So we can see what works and what does not.',
    },
    {
      heading: 'Where it goes',
      text: 'To Mixpanel, stored in the EU, under a random code instead of your name.',
    },
    {
      heading: 'Never included',
      text: 'Your name, email address, organization or the words of your challenges.',
    },
    'Nothing is sent to Mixpanel unless you choose to share. You can change your mind at any time under Profile & privacy, in the menu.',
  ],
}

export const latestAnalyticsVersion = '2026-10-07'

/** The words of a version, or none for a version without words. */
export function analyticsWordsOf(version: string): readonly Paragraph[] {
  return Object.hasOwn(analyticsTexts, version)
    ? (analyticsTexts[version] ?? [])
    : []
}
