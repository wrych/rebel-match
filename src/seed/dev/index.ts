import type { SeedChallenge, SeedExpertise, SeedPlan } from '../types.js'
import { challenges, expertise } from './challenges.js'
import { crowd } from './crowd.js'
import { crowdChallenges, crowdNotes } from './crowd-challenges.js'
import { connectionsFor, withJoinTimes } from './network.js'
import { DEV_ADMIN_EMAIL, people } from './people.js'

/** How many fictional members join the prototype's roster (R-SEED-10). */
const CROWD_SIZE = 83
// Whoever signs in as the dev admin finds their own lines in the replay
// (R-NET-2): they have been there on two trends.
const ADMIN_TRENDS = ['02', '06']
// Each crowd member from here on offers help on one trend, every other one
// on a second.
const FIRST_HELPER = 40
const TRENDS = Object.keys(crowdNotes)

function challengesOf(emails: readonly string[]): SeedChallenge[] {
  const bodies = TRENDS.flatMap((trendId) =>
    (crowdChallenges[trendId] ?? []).map((body) => ({ trendId, body })),
  )
  return bodies.flatMap(({ trendId, body }, index) => {
    const authorEmail = emails[index]
    return authorEmail === undefined ? [] : [{ authorEmail, trendId, body }]
  })
}

function offersOf(emails: readonly string[]): SeedExpertise[] {
  return emails.slice(FIRST_HELPER).flatMap((email, index) => {
    const picks = index % 2 === 0 ? [index, index + 3] : [index]
    return picks.map((pick) => {
      const trendId = TRENDS[pick % TRENDS.length] ?? '01'
      return { email, trendId, note: crowdNotes[trendId] ?? '' }
    })
  })
}

/** The dev fixtures: the prototype's roster and examples, a crowd around
 * them, and the network they formed over time (design §6.3, R-SEED-2,
 * R-SEED-10). */
export function devFixtures(): Pick<
  SeedPlan,
  'members' | 'challenges' | 'expertise' | 'connections'
> {
  const extra = crowd(CROWD_SIZE)
  const emails = extra.map((member) => member.email)
  const members = withJoinTimes([...people, ...extra])
  const allChallenges = [...challenges, ...challengesOf(emails)]
  const allExpertise = [
    ...expertise,
    ...ADMIN_TRENDS.map((trendId) => ({
      email: DEV_ADMIN_EMAIL,
      trendId,
      note: crowdNotes[trendId] ?? '',
    })),
    ...offersOf(emails),
  ]
  return {
    members,
    challenges: allChallenges,
    expertise: allExpertise,
    connections: connectionsFor(members, allChallenges, allExpertise),
  }
}
