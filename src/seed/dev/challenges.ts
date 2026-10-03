import type { SeedChallenge, SeedExpertise } from '../types.js'

const at = (name: string): string => `${name}@example.invalid`

/** The prototype's challenges: the authors' own plus the swipe deck
 * (design §6.3), so a dev deck and match lists are never empty. */
export const challenges: SeedChallenge[] = [
  {
    authorEmail: at('sanne.kuipers'),
    trendId: '06',
    body: 'We want to distribute power and decision-making, but now nobody knows who can actually decide what.',
  },
  {
    authorEmail: at('milan.horvat'),
    trendId: '06',
    body: 'Our circles keep escalating everything back to me. I have become the bottleneck I tried to remove.',
  },
  {
    authorEmail: at('elena.marchetti'),
    trendId: '07',
    body: 'We opened the books but not the salaries. Now people trust us less than before.',
  },
  {
    authorEmail: at('ola.nyberg'),
    trendId: '02',
    body: 'Two shifts, two cultures. The night shift never got the new structure explained to them.',
  },
  {
    authorEmail: at('yusuf.kaya'),
    trendId: '05',
    body: 'We promised autonomy, then added a weekly report to check on it.',
  },
  {
    authorEmail: at('hanna.vogt'),
    trendId: '01',
    body: 'Our values are on the wall and nowhere in our hiring decisions.',
  },
  {
    authorEmail: at('diego.salas'),
    trendId: '04',
    body: 'Every pilot we run gets absorbed into the old process within six months.',
  },
  {
    authorEmail: at('tobias.renner'),
    trendId: '07',
    body: 'We moved from hierarchical positions to roles and circles. Now we get backlash, because our salary model still reflects the old reality.',
  },
  {
    authorEmail: at('aline.dubois'),
    trendId: '08',
    body: 'We want to replace the annual performance review with regular peer feedback. Which approaches survive contact with reality?',
  },
  {
    authorEmail: at('jonas.brand'),
    trendId: '02',
    body: 'We introduced roles and circles, but people still behave as if the old hierarchy exists. A shadow organisation runs beside the official one.',
  },
  {
    authorEmail: at('priya.raman'),
    trendId: '05',
    body: 'We promised autonomy over where and when people work. Then leadership quietly asked everyone back for three fixed days.',
  },
  {
    authorEmail: at('lars.petersen'),
    trendId: '04',
    body: 'Every experiment we start dies in the annual budget cycle. Funding arrives eleven months after the idea does.',
  },
  {
    authorEmail: at('nadia.osei'),
    trendId: '01',
    body: 'Our purpose statement is beautiful, and nobody on a building site has ever used it to make a decision.',
  },
  {
    authorEmail: at('ruben.vos'),
    trendId: '03',
    body: 'We removed 40 management positions. Nobody prepared the people who stayed for what leadership now means.',
  },
]

/** The prototype's "been there" offers: each member's note for each trend
 * they can help with (design §6.3). */
export const expertise: SeedExpertise[] = [
  {
    email: at('marieke.de.wit'),
    trendId: '06',
    note: 'Ran a decision-mapping sprint when their circles stalled. Has the template.',
  },
  {
    email: at('marieke.de.wit'),
    trendId: '08',
    note: 'Ran a decision-mapping sprint when their circles stalled. Has the template.',
  },
  {
    email: at('tobias.renner'),
    trendId: '07',
    note: 'Rebuilt pay for a role-based org. Two failed attempts first.',
  },
  {
    email: at('tobias.renner'),
    trendId: '06',
    note: 'Rebuilt pay for a role-based org. Two failed attempts first.',
  },
  {
    email: at('ana.ferreira'),
    trendId: '06',
    note: 'Buurtzorg-style teams across 40 locations. Wrote the decision charter.',
  },
  {
    email: at('ana.ferreira'),
    trendId: '02',
    note: 'Buurtzorg-style teams across 40 locations. Wrote the decision charter.',
  },
  {
    email: at('jonas.brand'),
    trendId: '02',
    note: 'Three years against the shadow organisation. Knows the traps.',
  },
  {
    email: at('jonas.brand'),
    trendId: '03',
    note: 'Three years against the shadow organisation. Knows the traps.',
  },
  {
    email: at('priya.raman'),
    trendId: '05',
    note: 'Removed approval loops one by one, with a public log.',
  },
  {
    email: at('priya.raman'),
    trendId: '03',
    note: 'Removed approval loops one by one, with a public log.',
  },
  {
    email: at('lars.petersen'),
    trendId: '04',
    note: 'Killed the annual budget cycle. Has the CFO objections and the answers.',
  },
  {
    email: at('lars.petersen'),
    trendId: '07',
    note: 'Killed the annual budget cycle. Has the CFO objections and the answers.',
  },
  {
    email: at('nadia.osei'),
    trendId: '01',
    note: 'Got purpose onto the shop floor without a workshop deck.',
  },
  {
    email: at('nadia.osei'),
    trendId: '03',
    note: 'Got purpose onto the shop floor without a workshop deck.',
  },
  {
    email: at('ruben.vos'),
    trendId: '03',
    note: 'Retrained 40 managers into coaches. Half left. Honest about it.',
  },
  {
    email: at('ruben.vos'),
    trendId: '02',
    note: 'Retrained 40 managers into coaches. Half left. Honest about it.',
  },
  {
    email: at('aline.dubois'),
    trendId: '08',
    note: 'Replaced reviews with quarterly peer circles. Year three now.',
  },
  {
    email: at('aline.dubois'),
    trendId: '05',
    note: 'Replaced reviews with quarterly peer circles. Year three now.',
  },
]
