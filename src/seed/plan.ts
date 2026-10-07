import { isDevelopmentDeployment, type Config } from '../config.js'
import { challenges, expertise } from './dev/challenges.js'
import { people } from './dev/people.js'
import { companySizes, sectors } from '../profile-options.js'
import { caseStudies } from './shared/cases.js'
import { roles } from './shared/roles.js'
import { trends } from './shared/trends.js'
import type { SeedPlan } from './types.js'

/** What a profile seeds. Both get the roles, sector and company size lists,
 * trends and case studies; dev
 * adds the fictional roster with its challenges and offers, production its
 * private files once that loader lands (design §6.4). Refuses dev fixtures
 * when NODE_ENV=production (R-SEED-4), the prod profile in a development
 * deployment (R-SEED-8), and real admins in the dev profile (R-SEED-9). */
export function planSeed(config: {
  seedProfile: Config['seedProfile']
  seedAdmins?: Config['seedAdmins']
  env: Config['env']
  mail: Pick<Config['mail'], 'delivery'>
}): SeedPlan {
  const admins = config.seedAdmins ?? []
  const shared = { roles, sectors, companySizes, trends, cases: caseStudies }
  if (config.seedProfile === 'prod') {
    if (isDevelopmentDeployment(config)) {
      throw new Error(
        'seed: refusing SEED_PROFILE=prod in a development deployment ' +
          '(NODE_ENV=development, MAIL_DELIVERY=none) — its log keeps ' +
          'sign-in links readable, so real people must never be in it (R-SEED-8)',
      )
    }
    return { ...shared, members: [], admins, challenges: [], expertise: [] }
  }

  if (config.env === 'production') {
    throw new Error(
      'seed: refusing SEED_PROFILE=dev with NODE_ENV=production — ' +
        'fictional members must never reach production (R-SEED-4)',
    )
  }
  if (admins.length > 0) {
    throw new Error(
      'seed: refusing SEED_ADMINS with SEED_PROFILE=dev — the dev seed has ' +
        'its own admin, and real addresses stay out of fixtures (R-SEED-9)',
    )
  }
  return { ...shared, members: people, admins, challenges, expertise }
}
