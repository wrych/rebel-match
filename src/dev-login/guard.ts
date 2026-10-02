import { isDevelopmentDeployment, type Config } from '../config.js'
import { planSeed } from '../seed/plan.js'
import type { SeedMember } from '../seed/types.js'

type DevLoginConfig = Pick<Config, 'env' | 'mail' | 'seedProfile'>

/** Why a printed sign-in link is refused here, or null when it is allowed:
 * only a development deployment running the dev seed (R-DEV-6). */
export function devLoginRefusal(config: DevLoginConfig): string | null {
  if (!isDevelopmentDeployment(config)) {
    return 'needs NODE_ENV=development and MAIL_DELIVERY=none'
  }
  if (config.seedProfile !== 'dev') return 'needs SEED_PROFILE=dev'
  return null
}

/** The dev seed's member with this address, or null: a printed link is for
 * seeded members only (R-DEV-6). */
export function seededMember(
  config: DevLoginConfig,
  email: string,
): SeedMember | null {
  const wanted = email.trim().toLowerCase()
  return (
    planSeed(config).members.find((m) => m.email.toLowerCase() === wanted) ??
    null
  )
}

/** What the terminal shows: the link and the member's roles, never an email
 * address or a name (constitution §5). */
export function signInBanner(url: string, roles: readonly string[]): string {
  return [
    '',
    `  Sign in to Rebel Match (roles: ${roles.join(', ')}):`,
    `  ${url}`,
    '  It works once and expires soon. For another: npm run dev:login [email]',
    '',
  ].join('\n')
}
