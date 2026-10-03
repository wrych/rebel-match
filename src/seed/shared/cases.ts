import type { SeedCase } from '../types.js'

const BLOG = 'https://www.corporate-rebels.com/blog/'

function cases(
  trendId: string,
  entries: [org: string, slug: string, takeaway: string][],
): SeedCase[] {
  return entries.map(([org, slug, takeaway]) => ({
    trendId,
    org,
    url: `${BLOG}${slug}`,
    takeaway,
  }))
}

/** Curated Corporate Rebels case studies per trend, from the prototype
 * (design §6.2, R-ASK-8). */
export const caseStudies: SeedCase[] = [
  ...cases('01', [
    [
      'Patagonia',
      'patagonia',
      'Purpose as a filter for every business decision.',
    ],
    [
      "Tony's Chocolonely",
      'tonys-chocolonely',
      'A mission uncomfortable enough to activate outsiders too.',
    ],
    [
      'Morning Star',
      'morning-star',
      'Purpose translated into individual commitments.',
    ],
  ]),
  ...cases('02', [
    [
      'Haier',
      'haier-overview',
      '80,000 people as thousands of micro-enterprises.',
    ],
    [
      'Buurtzorg',
      'buurtzorg',
      'Teams of 12, no managers, and the coach role that holds it.',
    ],
    [
      '10 real structures',
      'progressive-organizational-structures',
      'Ten structures companies actually built, with trade-offs.',
    ],
    ['Viisi', 'viisi', 'Twelve years of Holacracy, including the unlearning.'],
  ]),
  ...cases('03', [
    [
      'FAVI',
      'zobrist',
      'Zobrist removed the control apparatus and stayed out of the way.',
    ],
    [
      'Haufe Umantis',
      'haufe-umantis',
      'Employees elect their leaders, every year.',
    ],
    [
      'USS Santa Fe',
      'david-marquet',
      'Leader-leader, tested on a nuclear submarine.',
    ],
  ]),
  ...cases('04', [
    [
      'Spotify',
      'spotify-1',
      'Bets and squads instead of cascaded annual plans.',
    ],
    ['UKTV', 'uktv', 'Unasked questions as an experiment engine.'],
    [
      'Matt Black Systems',
      'matt-black-systems',
      'Every person a business unit.',
    ],
  ]),
  ...cases('05', [
    [
      'FOD Social Security',
      'frank-van-massenhove',
      'A government body where nobody checks where you work.',
    ],
    [
      'Happy Ltd',
      'here-are-4-ways-to-effectively-build-more-trust-and-freedom-in-your-team',
      'Four moves that build trust instead of announcing it.',
    ],
    [
      'Ryzon',
      'ryzon-s-journey-to-a-4-day-work-week',
      'The four-day week, detail by detail.',
    ],
  ]),
  ...cases('06', [
    [
      'Advice process',
      'advice-process',
      'Answers “so who decides?” without a new hierarchy.',
    ],
    [
      'Morning Star',
      'morning-star',
      'Colleague letters of understanding: authority written by peers.',
    ],
    [
      'Decision mapping',
      'distribute-decision-making',
      'Five practices that make decision rights explicit.',
    ],
    [
      'Smarkets',
      'smarkets',
      'Decisions in the open, with the reasoning attached.',
    ],
  ]),
  ...cases('07', [
    [
      'Freitag',
      'freitag-we-have-radically-simplified-our-salary-scales',
      'Radically simplified salary scales, and how they landed it.',
    ],
    [
      'Flat-org pay',
      'remuneration-method-for-flat-organizations',
      'A pay method built for roles and circles.',
    ],
    [
      'Self-set salaries',
      'self-set-salaries',
      'What happens when people set their own pay.',
    ],
    [
      'Semco',
      'semco',
      'Open books as the precondition for distributed authority.',
    ],
  ]),
  ...cases('08', [
    [
      'Netflix',
      'annual-performance-reviews',
      'How they killed the annual review, and what replaced it.',
    ],
    [
      'NextJump',
      'next-jump',
      'Continuous peer coaching inside the working week.',
    ],
    ['Spotify', 'spotify-development', 'Development without a career ladder.'],
    ['Job crafting', 'job-crafting', 'People assembling roles out of talents.'],
  ]),
]
