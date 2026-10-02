import type { Config } from '../config.js'
import { people } from './dev/people.js'
import { roles } from './shared/roles.js'
import type { SeedPlan } from './types.js'

/** What a profile seeds. Production gets only shared content until its private
 * whitelist loader lands (design §6.4); dev adds the fictional roster. Refuses
 * dev fixtures when NODE_ENV=production (R-SEED-4). */
export function planSeed(
  config: Pick<Config, 'seedProfile' | 'env'>,
): SeedPlan {
  if (config.seedProfile === 'prod') return { roles, members: [] }

  if (config.env === 'production') {
    throw new Error(
      'seed: refusing SEED_PROFILE=dev with NODE_ENV=production — ' +
        'fictional members must never reach production (R-SEED-4)',
    )
  }
  return { roles, members: people }
}
