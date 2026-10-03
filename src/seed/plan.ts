import type { Config } from '../config.js'
import { challenges, expertise } from './dev/challenges.js'
import { people } from './dev/people.js'
import { caseStudies } from './shared/cases.js'
import { roles } from './shared/roles.js'
import { trends } from './shared/trends.js'
import type { SeedPlan } from './types.js'

/** What a profile seeds. Both get the roles, trends and case studies; dev
 * adds the fictional roster with its challenges and offers, production its
 * private files once that loader lands (design §6.4). Refuses dev fixtures
 * when NODE_ENV=production (R-SEED-4). */
export function planSeed(
  config: Pick<Config, 'seedProfile' | 'env'>,
): SeedPlan {
  const shared = { roles, trends, cases: caseStudies }
  if (config.seedProfile === 'prod') {
    return { ...shared, members: [], challenges: [], expertise: [] }
  }

  if (config.env === 'production') {
    throw new Error(
      'seed: refusing SEED_PROFILE=dev with NODE_ENV=production — ' +
        'fictional members must never reach production (R-SEED-4)',
    )
  }
  return { ...shared, members: people, challenges, expertise }
}
