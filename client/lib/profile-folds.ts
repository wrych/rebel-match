import { holds, searchTerm } from './folds'

/** A card of the profile screen and the words a search finds it by
 * (R-PROF-8). */
export type ProfileFold = { title: string; words: readonly string[] }

/** What hosts have on that adds to the profile screen. */
export type ProfileOffers = { socialLinks: boolean; codes: boolean }

const ABOUT_YOU: ProfileFold = {
  title: 'About you',
  words: [
    'Your photo',
    'Your name',
    'Job title',
    'Organization',
    'Sector',
    'Company size',
    'Signed in as',
    'Email',
  ],
}
const SOCIAL_WORDS = ['Social links', 'LinkedIn']
const CODE_WORDS = [
  'Your code',
  'Profile code',
  'Reset code',
  'Connect now',
  'Share my profile',
  'QR',
]
const LATER: readonly ProfileFold[] = [
  { title: 'Notifications', words: ['Notifications', 'Email'] },
  {
    title: 'Privacy',
    words: [
      'Usage data',
      'Analytics',
      'The terms you accepted',
      'Consent',
      'Privacy notice',
      'Terms of use',
    ],
  },
  {
    title: 'Look',
    words: ['Colour mode', 'Color mode', 'Happy colour mode', 'Calm'],
  },
  {
    title: 'Your data',
    words: ['Your activity history', 'Delete your account'],
  },
]

/** The profile screen's cards, in order, each with the words of what it
 * holds as offered now (R-PROF-8). */
export function profileFolds(offers: ProfileOffers): ProfileFold[] {
  const connecting: ProfileFold = {
    title: 'Connecting',
    words: [
      ...(offers.socialLinks ? SOCIAL_WORDS : []),
      ...(offers.codes ? CODE_WORDS : []),
      'Findable in search',
    ],
  }
  return [ABOUT_YOU, connecting, ...LATER]
}

/** The titles of the cards a search shows: those whose title or words hold
 * it, ignoring case; all of them while it is too short to be one
 * (R-PROF-8). */
export function searchProfile(
  folds: readonly ProfileFold[],
  search: string,
): string[] {
  const needle = searchTerm(search)
  return folds
    .filter(
      (fold) =>
        needle === null ||
        [fold.title, ...fold.words].some((word) => holds(word, needle)),
    )
    .map((fold) => fold.title)
}
