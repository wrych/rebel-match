import { holds, searchTerm } from './folds'

/** A card of the profile screen and the words a search finds it by
 * (R-PROF-8). */
export type ProfileFold = { title: string; words: readonly string[] }

/** What hosts have on that adds to the profile screen. */
export type ProfileOffers = { socialLinks: boolean; codes: boolean }

/** The profile screen's cards, in order, each with the words of what it
 * holds as offered now (R-PROF-8). */
export function profileFolds(offers: ProfileOffers): ProfileFold[] {
  return [
    {
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
    },
    {
      title: 'Connecting',
      words: [
        ...(offers.socialLinks
          ? ['Social links', 'LinkedIn', 'Instagram']
          : []),
        ...(offers.codes ? ['Profile code', 'Reset code', 'QR'] : []),
        'Findable in search',
      ],
    },
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
      title: 'Your data',
      words: ['Your activity history', 'Delete your account'],
    },
  ]
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
